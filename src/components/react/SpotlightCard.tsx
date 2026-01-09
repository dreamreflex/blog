import { useRef, useState, useEffect } from 'react';

const SpotlightCard = ({ children, className = "", spotlightColor = "" }: { children: React.ReactNode, className?: string, spotlightColor?: string }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);
  const [computedSpotlightColor, setComputedSpotlightColor] = useState(spotlightColor);

  useEffect(() => {
    if (spotlightColor) {
        setComputedSpotlightColor(spotlightColor);
        return;
    }

    // Function to update color from CSS variable
    const updateColor = () => {
        const color = getComputedStyle(document.documentElement).getPropertyValue('--spotlight-color').trim();
        setComputedSpotlightColor(color || "rgba(255, 255, 255, 0.25)");
    };

    updateColor();

    // Create an observer to watch for class changes on the html element (for theme toggling)
    const observer = new MutationObserver(updateColor);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, [spotlightColor]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;

    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseEnter = () => {
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50 ${className} group`}
      style={{
          // Use CSS variables for theme support
          backgroundColor: 'var(--background-card)',
          borderColor: 'var(--border-color)',
          boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
          transition: 'transform 0.2s, box-shadow 0.2s'
      }}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, ${computedSpotlightColor}, transparent 40%)`,
        }}
      />
      <div className="relative h-full">{children}</div>
      <style>{`
        .group:hover {
            transform: translateY(-5px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1) !important;
        }
      `}</style>
    </div>
  );
};

export default SpotlightCard;
