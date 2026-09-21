interface LoadingProps {
  label?: string;
}

/** Shared loading state — a quiet spinner rather than a bare line of text. */
export default function Loading({ label = 'Loading…' }: LoadingProps) {
  return (
    <div className="loading" role="status">
      <span className="loading__spinner" aria-hidden="true" />
      <span className="loading__label">{label}</span>
    </div>
  );
}
