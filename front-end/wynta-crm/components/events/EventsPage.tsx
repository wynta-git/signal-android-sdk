'use client';
import { useState, useMemo, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '../../store/hooks';
import Icon from 'wynta-react-common/components/Icon';
import {
  fetchEvents,
  fetchEventProperties,
  fetchTraits,
  selectEvent,
  selectRawEvents,
  selectDerivedRules,
  selectSelectedEvent,
  selectEventProperties,
  selectTraits,
  selectEventsStatus,
  selectPropertiesStatus,
  selectTraitsStatus,
  selectEventsError,
  selectPropertiesError,
  selectTraitsError,
} from '../../store/slices/eventsSlice';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** snake_case / kebab-case → Title Case */
function toLabel(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface EventListProps {
  title:       string;
  icon:        string;
  iconColor:   string;
  items:       string[];
  selected:    string | null;
  loading:     boolean;
  onSelect:    (name: string) => void;
  selectable?: boolean;
  error?:      string | null;
}

function EventList({ title, icon, iconColor, items, selected, loading, onSelect, selectable = true, error }: EventListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter(i => i.toLowerCase().includes(q)) : items;
  }, [items, search]);

  return (
    <div className="ev-section">
      <div className="ev-section-header">
        <span className="ev-section-title">
          <Icon name={icon as any} size={14} color={iconColor} />
          {title}
        </span>
        <span className="ev-section-count">{filtered.length}</span>
      </div>
      <div className="ev-section-search">
        <Icon name="search" size={13} color="var(--g400)" />
        <input
          placeholder={`Search ${title.toLowerCase()}…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" onClick={() => setSearch('')}>
            <Icon name="x" size={12} />
          </button>
        )}
      </div>

      <div className="ev-list">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="ev-list-skeleton" />
          ))
        ) : error ? (
          <div className="ev-empty ev-empty--error">
            <Icon name="alert-circle" size={13} />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="ev-empty">
            {search ? `No results for "${search}"` : `No ${title.toLowerCase()} available`}
          </div>
        ) : (
          filtered.map(name => (
            selectable ? (
              <button
                key={name}
                type="button"
                className={'ev-list-item' + (selected === name ? ' selected' : '')}
                onClick={() => onSelect(name)}
                title={name}
              >
                <span className="ev-list-item-dot" />
                <span className="ev-list-item-label">{toLabel(name)}</span>
                <span className="ev-list-item-raw">{name}</span>
              </button>
            ) : (
              <div key={name} className="ev-list-item ev-list-item--static" title={name}>
                <span className="ev-list-item-dot" />
                <span className="ev-list-item-label">{toLabel(name)}</span>
                <span className="ev-list-item-raw">{name}</span>
              </div>
            )
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EventsPage({ brandId }: { brandId?: number }) {
  const dispatch       = useDispatch<any>();
  const rawEvents      = useAppSelector(selectRawEvents);
  const derivedRules   = useAppSelector(selectDerivedRules);
  const selectedEvent  = useAppSelector(selectSelectedEvent);
  const properties     = useAppSelector(selectEventProperties);
  const traits         = useAppSelector(selectTraits);
  const evStatus       = useAppSelector(selectEventsStatus);
  const propStatus     = useAppSelector(selectPropertiesStatus);
  const traitsStatus   = useAppSelector(selectTraitsStatus);
  const evError        = useAppSelector(selectEventsError);
  const propError      = useAppSelector(selectPropertiesError);
  const traitsError    = useAppSelector(selectTraitsError);

  const [propSearch, setPropSearch] = useState('');

  useEffect(() => {
    dispatch(fetchEvents({ brandId }));
    dispatch(fetchTraits(brandId));
  }, [dispatch, brandId]);

  /* Auto-select first raw event after load */
  useEffect(() => {
    if (evStatus === 'succeeded' && rawEvents.length > 0 && !selectedEvent) {
      handleSelect(rawEvents[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evStatus, rawEvents.length]);

  function handleSelect(name: string) {
    dispatch(selectEvent(name));
    dispatch(fetchEventProperties({ eventName: name }));
    setPropSearch('');
  }

  const filteredProps = useMemo(() => {
    const q = propSearch.trim().toLowerCase();
    return q ? properties.filter(p => p.toLowerCase().includes(q)) : properties;
  }, [properties, propSearch]);

  const loading = evStatus === 'loading';

  return (
    <div className="ev-page">
      {/* ── Header ── */}
      <div className="seg-page-header">
        <div>
          <div className="seg-page-title">Events</div>
          <div className="seg-page-subtitle">
            Raw events and derived rules available for segmentation
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {evError && (
        <div className="ev-error-banner">
          <Icon name="alert-circle" size={14} />
          Unable to load events. Check your connection and try again.
        </div>
      )}

      {/* ── Main layout: two event lists + properties panel ── */}
      <div className="ev-layout">

        {/* Left: event lists */}
        <div className="ev-left">
          <EventList
            title="User Events"
            icon="zap"
            iconColor="var(--warn, #f59e0b)"
            items={rawEvents}
            selected={selectedEvent}
            loading={loading}
            onSelect={handleSelect}
          />

          {/* <EventList
            title="Derived Rules"
            icon="git-branch"
            iconColor="var(--blue, #0091e0)"
            items={derivedRules}
            selected={null}
            loading={loading}
            onSelect={() => {}}
            selectable={false}
          /> */}

          <EventList
            title="User Property"
            icon="tag"
            iconColor="var(--success, #10b981)"
            items={traits}
            selected={null}
            loading={traitsStatus === 'loading'}
            onSelect={() => {}}
            selectable={false}
            error={traitsError}
          />
        </div>

        {/* Right: properties panel */}
        <div className="ev-right">
          <div className="ev-props-card">
            <div className="ev-props-header">
              <div className="ev-props-title">
                {selectedEvent ? (
                  <>
                    <Icon name="list" size={14} color="var(--blue)" />
                    Properties — <strong>{toLabel(selectedEvent)}</strong>
                  </>
                ) : (
                  <>
                    <Icon name="list" size={14} color="var(--g400)" />
                    Properties
                  </>
                )}
              </div>
              {filteredProps.length > 0 && (
                <span className="ev-section-count">{filteredProps.length}</span>
              )}
            </div>

            {selectedEvent && (
              <div className="ev-section-search">
                <Icon name="search" size={13} color="var(--g400)" />
                <input
                  placeholder="Search properties…"
                  value={propSearch}
                  onChange={e => setPropSearch(e.target.value)}
                />
                {propSearch && (
                  <button type="button" onClick={() => setPropSearch('')}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
            )}

            <div className="ev-props-body">
              {!selectedEvent ? (
                <div className="ev-props-empty">
                  <Icon name="mouse-pointer-click" size={32} color="var(--g300)" />
                  <p>Select an event to view its properties</p>
                </div>
              ) : propStatus === 'loading' ? (
                <div className="ev-props-list">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="ev-prop-skeleton" />
                  ))}
                </div>
              ) : propError ? (
                <div className="ev-error-banner" style={{ margin: 12 }}>
                  <Icon name="alert-circle" size={13} />
                  {propError}
                </div>
              ) : filteredProps.length === 0 ? (
                <div className="ev-empty" style={{ padding: 24 }}>
                  {propSearch
                    ? `No properties match "${propSearch}"`
                    : 'No properties found for this event'}
                </div>
              ) : (
                <div className="ev-props-list">
                  {filteredProps.map((prop, i) => (
                    <div key={prop} className="ev-prop-row">
                      <span className="ev-prop-index">{i + 1}</span>
                      <span className="ev-prop-name">{prop}</span>
                      <span className="ev-prop-label">{toLabel(prop)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
