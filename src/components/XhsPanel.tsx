import { useState, useRef } from 'react';
import { AgendaItem } from '../types';
import { classifyImportInput } from '../utils/importSources';
import { mapXhsResponseToAgendaDraft, parseXiaohongshuUrl } from '../utils/xiaohongshu';
import { summarizeXhsPosts } from '../utils/aiPlanner';

type ParseStatus = 'loading' | 'parsed' | 'partial' | 'failed';

type ImportCache = Record<string, Omit<AgendaItem, 'id'>[]>;

interface ParsedXhsRow {
  rawInput: string;
  loading: boolean;
  status: ParseStatus;
  title?: string;
  draft?: Omit<AgendaItem, 'id'>;
  imageCount?: number;
  warningText?: string;
  error?: string;
}

function getCacheKey(): string {
  return 'travel-import-cache';
}

function normalizeCacheKey(input: string): string {
  return input.trim().toLowerCase();
}

function loadCache(): ImportCache {
  try {
    const raw = localStorage.getItem(getCacheKey());
    if (!raw) return {};
    return JSON.parse(raw) as ImportCache;
  } catch {
    return {};
  }
}

function writeCache(cache: ImportCache): void {
  localStorage.setItem(getCacheKey(), JSON.stringify(cache));
}

function resolveFromCache(line: string, draft: Omit<AgendaItem, 'id'>): ParsedXhsRow {
  return {
    rawInput: line,
    loading: false,
    status: draft.sourceType === 'xiaohongshu' && (!draft.lat || !draft.lng) ? 'partial' : 'parsed',
    title: draft.title,
    draft,
    imageCount: draft.sourceContent?.images?.length || (draft.imageUrl ? 1 : 0),
    warningText: draft.sourceType === 'xiaohongshu' && (!draft.lat || !draft.lng) ? 'Loaded from cache (no coordinates)' : undefined
  };
}

interface XhsPanelProps {
  geminiKey: string;
  onClose: () => void;
  hidden?: boolean;
}

export function XhsPanel({ geminiKey, onClose, hidden }: XhsPanelProps) {
  const [inputText, setInputText] = useState('');
  const [rows, setRows] = useState<ParsedXhsRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [viewingRow, setViewingRow] = useState<ParsedXhsRow | null>(null);
  // Ref to track existing keys across async iterations without stale closure
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const parseInput = async () => {
    setIsParsing(true);

    const lines = inputText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => classifyImportInput(l) === 'xiaohongshu');

    if (lines.length === 0) {
      alert('Please paste Xiaohongshu links (one per line).');
      setIsParsing(false);
      return;
    }

    // Deduplicate against already-parsed rows
    const existingKeys = new Set(rowsRef.current.map((r) => normalizeCacheKey(r.rawInput)));
    const newLines = lines.filter((l) => !existingKeys.has(normalizeCacheKey(l)));

    if (newLines.length === 0) {
      setInputText('');
      setIsParsing(false);
      return;
    }

    setInputText('');

    const cache = loadCache();

    try {
      for (const line of newLines) {
        // Add a loading placeholder for this line
        setRows((prev) => [...prev, {
          rawInput: line,
          loading: true,
          status: 'loading' as const
        }]);

        const cacheKey = normalizeCacheKey(line);
        const cachedDrafts = cache[cacheKey];
        let resolved: ParsedXhsRow;

        if (cachedDrafts && cachedDrafts.length > 0) {
          resolved = resolveFromCache(line, cachedDrafts[0]);
        } else {
          try {
            const payload = await parseXiaohongshuUrl(line);
            const warningText = payload.warnings?.join('; ');

            if (payload.status === 'failed') {
              resolved = {
                rawInput: line,
                loading: false,
                status: 'failed',
                error: payload.errorMessage || payload.errorCode || 'Parsing failed',
                warningText
              };
            } else {
              const draft = mapXhsResponseToAgendaDraft(payload);
              cache[cacheKey] = [draft];
              writeCache(cache);

              resolved = {
                rawInput: line,
                loading: false,
                status: payload.status,
                title: draft.title,
                draft,
                imageCount: payload.images?.length || draft.sourceContent?.images?.length || 0,
                warningText
              };
            }
          } catch (e: any) {
            resolved = {
              rawInput: line,
              loading: false,
              status: 'failed',
              error: e?.message || 'Unknown parse error'
            };
          }
        }

        // Replace the loading placeholder with the resolved row
        const resolvedRow = resolved;
        setRows((prev) =>
          prev.map((r) =>
            r.rawInput === line && r.loading ? resolvedRow : r
          )
        );
      }
    } finally {
      setIsParsing(false);
    }
  };

  const handleSummarize = async () => {
    if (!geminiKey) return;
    setIsSummarizing(true);
    setSummaryError(null);
    try {
      const posts = rows
        .filter((r) => r.status !== 'failed' && r.draft)
        .map((r) => ({
          title: r.draft!.title,
          fullText: r.draft!.sourceContent?.fullText || r.draft!.notes
        }));
      const result = await summarizeXhsPosts(geminiKey, posts);
      setSummary(result);
    } catch (e: any) {
      setSummaryError(e?.message || 'Summarization failed');
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="xhs-panel" style={hidden ? { display: 'none' } : undefined}>
      <div className="xhs-panel-header">
        <h3>Import XHS</h3>
        <button className="xhs-panel-close" onClick={onClose} title="Close">×</button>
      </div>

      <div className="xhs-panel-body">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={"Paste XHS links here\n(one per line)"}
          rows={3}
          className="xhs-panel-textarea"
        />

        <button className="parse-btn" onClick={parseInput} disabled={!inputText.trim() || isParsing}>
          {isParsing ? 'Parsing...' : 'Add Links'}
        </button>

        {rows.length > 0 && (
          <div className="xhs-panel-list">
            {rows.map((row, idx) => {
              const previewImage = row.draft?.imageUrl || row.draft?.sourceContent?.images?.[0];

              return (
                <div
                  key={`${row.rawInput}-${idx}`}
                  className={`xhs-panel-item ${row.loading ? 'loading' : 'clickable'}`}
                  onClick={() => { if (!row.loading && row.draft) setViewingRow(row); }}
                >
                  {previewImage && <img src={previewImage} alt="" className="xhs-panel-thumb" />}
                  <div className="xhs-panel-item-info">
                    <strong>{row.title || row.rawInput}</strong>
                    <div className="place-meta-row">
                      <span className="source-badge source-xiaohongshu">小红书</span>
                      {typeof row.imageCount === 'number' && row.imageCount > 0 && (
                        <span className="image-count">{row.imageCount} img</span>
                      )}
                      {row.status === 'partial' && <span className="status-badge partial">Partial</span>}
                    </div>
                    {row.warningText && <span className="warning-text">{row.warningText}</span>}
                    {row.error && <span className="error">Error: {row.error}</span>}
                  </div>
                  {!row.loading && (
                    <button
                      className="xhs-panel-remove-btn"
                      onClick={(e) => { e.stopPropagation(); removeRow(idx); }}
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {geminiKey && rows.length > 0 && !isParsing && (
          <div className="xhs-summarize-row">
            <button
              className="summarize-btn"
              onClick={handleSummarize}
              disabled={isSummarizing}
            >
              {isSummarizing ? '✨ Summarizing...' : '✨ Summarize'}
            </button>
            {summaryError && <span className="error" style={{ marginLeft: 8 }}>{summaryError}</span>}
          </div>
        )}

        {summary && (
          <div className="xhs-summary-box">
            {summary.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}

      </div>

      {viewingRow && viewingRow.draft && (
        <div className="modal-overlay" onClick={() => setViewingRow(null)}>
          <div className="modal xhs-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-x" onClick={() => setViewingRow(null)} title="Close">×</button>
            <h2>{viewingRow.draft.title}</h2>

            {viewingRow.draft.sourceMeta?.author && (
              <p className="xhs-detail-author">by {viewingRow.draft.sourceMeta.author}</p>
            )}

            {viewingRow.draft.sourceContent?.images && viewingRow.draft.sourceContent.images.length > 0 && (
              <div className="xhs-detail-images">
                {viewingRow.draft.sourceContent.images.map((img, i) => (
                  <img key={i} src={img} alt="" className="xhs-detail-img" />
                ))}
              </div>
            )}

            {viewingRow.draft.sourceContent?.fullText && (
              <div className="xhs-detail-text">
                {viewingRow.draft.sourceContent.fullText.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}

            {viewingRow.draft.location && (
              <p className="xhs-detail-location">{viewingRow.draft.location}</p>
            )}

            {viewingRow.draft.sourceUrl && (
              <a
                className="xhs-detail-link"
                href={viewingRow.draft.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View original post
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
