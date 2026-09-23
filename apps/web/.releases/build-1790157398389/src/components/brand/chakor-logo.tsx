import Image from "next/image";

const CHAKOR_LOGO_SRC = "/icons/chakor-logo-192.png";

/**
 * Chakor brand mark. The source image already carries the navy background,
 * so the wrapper only needs to clip it to the rounded tile shape.
 */
export default function ChakorLogo({
  size = 32,
  className = "",
  rounded = "rounded-lg",
  priority = false,
}: {
  size?: number;
  className?: string;
  rounded?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-[#161f45] shadow-sm ${rounded} ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={CHAKOR_LOGO_SRC}
        alt="Chakor"
        width={size}
        height={size}
        priority={priority}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
