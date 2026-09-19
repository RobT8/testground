import { initialOf, textOn } from '../utils/colour';

interface ChildAvatarProps {
  name: string;
  colour: string;
  /** Diameter in pixels. */
  size?: number;
}

/** Circle carrying a child's initial, in that child's colour. */
export default function ChildAvatar({ name, colour, size = 32 }: ChildAvatarProps) {
  return (
    <span
      className="child-avatar"
      style={{
        width: size,
        height: size,
        background: colour,
        color: textOn(colour),
        fontSize: Math.round(size * 0.44),
      }}
      aria-hidden="true"
    >
      {initialOf(name)}
    </span>
  );
}
