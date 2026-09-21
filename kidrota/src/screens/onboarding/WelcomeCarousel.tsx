import { useRef, useState } from 'react';

const SLIDES = [
  {
    icon: 'calendar',
    title: 'School holidays sorted',
    body: 'Plan who’s looking after the kids during every school break. See gaps at a glance.',
  },
  {
    icon: 'tap',
    title: 'One tap planning',
    body: 'Assign carers to mornings and afternoons. Repeat across the week.',
  },
  {
    icon: 'lock',
    title: 'No account needed',
    body: 'Everything stays on your phone. Private and offline.',
  },
];

function SlideIcon({ name }: { name: string }) {
  const common = {
    width: 56,
    height: 56,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
        <path d="M11 14h2v3h-2z" />
      </svg>
    );
  }
  if (name === 'tap') {
    return (
      <svg {...common}>
        <path d="M9 11V6a1.5 1.5 0 0 1 3 0v5" />
        <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" />
        <path d="M15 11V7.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2a1.5 1.5 0 0 1 3 0" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M10.5 18.5h3" />
      <path d="M9.5 11V9.5a2.5 2.5 0 0 1 5 0V11" />
      <rect x="8.5" y="11" width="7" height="5" rx="1.2" />
    </svg>
  );
}

interface WelcomeCarouselProps {
  onDone: () => void;
}

/**
 * The three welcome slides.
 *
 * Swiping is CSS scroll-snap rather than a gesture handler, so it inherits the
 * platform's own momentum and rubber-banding instead of approximating them.
 */
export default function WelcomeCarousel({ onDone }: WelcomeCarouselProps) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  function handleScroll() {
    const track = trackRef.current;
    if (!track) return;
    const slide = Math.round(track.scrollLeft / track.clientWidth);
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, slide)));
  }

  function goTo(slide: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: slide * track.clientWidth, behavior: 'smooth' });
  }

  const isLast = index === SLIDES.length - 1;

  return (
    <div className="welcome">
      <div className="welcome__skip">
        <button type="button" className="link-button" onClick={onDone}>
          Skip
        </button>
      </div>

      <div className="welcome__track" ref={trackRef} onScroll={handleScroll}>
        {SLIDES.map((slide) => (
          <section className="welcome__slide" key={slide.title}>
            <span className="welcome__icon">
              <SlideIcon name={slide.icon} />
            </span>
            <h1 className="welcome__title">{slide.title}</h1>
            <p className="welcome__body">{slide.body}</p>
          </section>
        ))}
      </div>

      <div className="welcome__dots">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            className={i === index ? 'dot dot--active' : 'dot'}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <button
        type="button"
        className="button button--primary"
        onClick={() => (isLast ? onDone() : goTo(index + 1))}
      >
        {isLast ? 'Get started' : 'Next'}
      </button>
    </div>
  );
}
