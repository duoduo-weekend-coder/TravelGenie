import { useState, useRef, useEffect } from 'react';
import { AgendaItem, Category, PlaceOpeningHours } from '../types';
import { fetchPlaceDetails, fetchPlaceExtras, getCategoryFromTypes } from '../googleMaps';
import { inferTimeSlot } from '../utils/time';

interface Props {
  item?: AgendaItem;
  prefill?: { time?: string; timeSlot?: 'am' | 'pm'; suggestedDuration?: number } | null;
  onSave: (item: Omit<AgendaItem, 'id'> | AgendaItem, targetDate?: string) => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onClose: () => void;
  onEnrichItem?: (itemId: string, data: Partial<AgendaItem>) => void;
  availableDays?: { id: string; date: string }[];
  showDatePicker?: boolean;
}

const categories: Category[] = ['transport', 'food', 'activity', 'accommodation', 'other'];

export function EditModal({ item, prefill, onSave, onDelete, onCopy, onClose, onEnrichItem, availableDays, showDatePicker }: Props) {
  const [title, setTitle] = useState(item?.title || '');
  const [time, setTime] = useState(item?.time || prefill?.time || '');
  const [selectedDate, setSelectedDate] = useState('');
  const [location, setLocation] = useState(item?.location || '');
  const [googleMapsUrl, setGoogleMapsUrl] = useState(item?.googleMapsUrl || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [category, setCategory] = useState<Category>(item?.category || 'activity');
  const [timeSlot, setTimeSlot] = useState<'am' | 'pm' | ''>(item?.timeSlot || prefill?.timeSlot || '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl || '');
  const [googlePlacePhoto, setGooglePlacePhoto] = useState(item?.googlePlacePhoto || '');
  const [lat, setLat] = useState<number | undefined>(item?.lat);
  const [lng, setLng] = useState<number | undefined>(item?.lng);
  const [openingHours, setOpeningHours] = useState<PlaceOpeningHours | undefined>(item?.openingHours);
  const [reservable] = useState<boolean | undefined>(item?.reservable);
  const [suggestedDuration, setSuggestedDuration] = useState<number | undefined>(item?.suggestedDuration ?? prefill?.suggestedDuration);
  const [fetching, setFetching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Lazy-load photos and opening hours for Google Maps places on modal open
  useEffect(() => {
    if (!item?.googlePlaceName || (item.imageUrl && item.openingHours)) return;
    let cancelled = false;
    (async () => {
      const details = await fetchPlaceDetails(item.googlePlaceName!);
      if (cancelled || !details?.place_id) return;
      const extras = await fetchPlaceExtras(details.place_id);
      if (cancelled || !extras) return;
      const enrichData: Partial<AgendaItem> = {};
      if (extras.photos?.[0] && !imageUrl) {
        setImageUrl(extras.photos[0]);
        enrichData.imageUrl = extras.photos[0];
      }
      if (extras.photoUrls?.[0] && !googlePlacePhoto) {
        setGooglePlacePhoto(extras.photoUrls[0]);
        enrichData.googlePlacePhoto = extras.photoUrls[0];
      }
      if (extras.openingHours && !openingHours) {
        setOpeningHours(extras.openingHours);
        enrichData.openingHours = extras.openingHours;
      }
      // Persist enrichment to trip state so thumbnails survive modal close
      if (onEnrichItem && item.id && Object.keys(enrichData).length > 0) {
        onEnrichItem(item.id, enrichData);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleUrlBlur = async () => {
    const isGoogleUrl = googleMapsUrl.includes('google.com/maps') || googleMapsUrl.includes('goo.gl') || googleMapsUrl.includes('maps.app.goo.gl');
    if (googleMapsUrl && isGoogleUrl && !fetching) {
      setFetching(true);
      const details = await fetchPlaceDetails(googleMapsUrl);
      if (details) {
        if (!title) setTitle(details.name);
        if (!location) setLocation(details.formatted_address || '');
        if (!imageUrl && details.photos?.[0]) setImageUrl(details.photos[0]);
        setLat(details.lat);
        setLng(details.lng);
        setCategory(getCategoryFromTypes(details.types || []) as Category);
        setOpeningHours(details.openingHours);
      }
      setFetching(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImageUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Auto-infer timeSlot from time string if user didn't explicitly pick one
    const effectiveSlot = timeSlot || inferTimeSlot(time) || undefined;
    const data = {
      title, time, location, lat, lng, googleMapsUrl, notes, category, imageUrl, googlePlacePhoto, openingHours, reservable, suggestedDuration,
      ...(effectiveSlot ? { timeSlot: effectiveSlot } : {})
    };
    if (item) {
      onSave({ ...data, id: item.id }, selectedDate || undefined);
    } else {
      onSave(data, selectedDate || undefined);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{item ? 'Edit Item' : 'Add Item'}</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Title *"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
          <div className="time-row">
            <input
              type="text"
              placeholder="Time (e.g., 9:00 AM)"
              value={time}
              onChange={e => setTime(e.target.value)}
            />
            <input
              type="number"
              placeholder="Duration (min)"
              value={suggestedDuration || ''}
              onChange={e => setSuggestedDuration(parseInt(e.target.value) || undefined)}
              style={{ width: '120px' }}
            />
            <select value={timeSlot} onChange={e => setTimeSlot(e.target.value as 'am' | 'pm' | '')}>
              <option value="">No slot</option>
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>
          </div>
          {showDatePicker && availableDays && availableDays.length > 0 && (
            <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}>
              <option value="">No day assigned</option>
              {availableDays.map(d => {
                const dateObj = new Date(d.date + 'T00:00:00');
                const label = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                return <option key={d.id} value={d.date}>{label}</option>;
              })}
            </select>
          )}
          <input
            type="text"
            placeholder="Location"
            value={location}
            onChange={e => setLocation(e.target.value)}
          />
          <div className="url-input-row">
            <input
              type="url"
              placeholder="Google Maps URL"
              value={googleMapsUrl}
              onChange={e => setGoogleMapsUrl(e.target.value)}
              onBlur={handleGoogleUrlBlur}
            />
            {fetching && <span className="fetching">Fetching...</span>}
          </div>
          <textarea
            placeholder="Notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
          <select value={category} onChange={e => setCategory(e.target.value as Category)}>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <div className="image-section">
            {imageUrl ? (
              <img src={imageUrl} alt="Preview" className="image-preview" />
            ) : null}
            <input
              type="file"
              ref={fileRef}
              onChange={handleFileChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <button type="button" onClick={() => fileRef.current?.click()}>
              {imageUrl ? 'Change Image' : 'Add Image'}
            </button>
            {imageUrl && (
              <button type="button" onClick={() => setImageUrl('')} className="remove-img">
                Remove
              </button>
            )}
          </div>
          {(item?.sourceUrl || item?.sourceType === 'xiaohongshu') && (
            <div className="source-meta-section">
              <label>Source URL</label>
              <input type="text" readOnly value={item?.sourceUrl || ''} />
              {item?.sourceMeta?.author && (
                <p className="source-meta-line">Author: {item.sourceMeta.author}</p>
              )}
              {item?.sourceMeta?.publishTime && (
                <p className="source-meta-line">Publish time: {item.sourceMeta.publishTime}</p>
              )}
              {item?.sourceContent?.fullText && (
                <>
                  <label>Source Text</label>
                  <textarea readOnly value={item.sourceContent.fullText} rows={4} />
                </>
              )}
              {item?.sourceContent?.images && item.sourceContent.images.length > 0 && (
                <div className="source-image-grid">
                  {item.sourceContent.images.map((src, index) => (
                    <img key={`${src}-${index}`} src={src} alt="Source preview" className="source-image-preview" />
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="modal-actions">
            {item && onDelete && (
              <button type="button" className="delete-btn" onClick={onDelete}>
                Delete
              </button>
            )}
            {item && onCopy && (
              <button type="button" className="copy-btn" onClick={onCopy} title="Copy to clipboard">
                Copy
              </button>
            )}
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="save-btn">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
