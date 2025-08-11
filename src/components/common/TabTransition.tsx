import React, { useEffect, useState } from "react";

interface TabTransitionProps {
  children: React.ReactNode;
  activeKey: string;
  direction?: "fade" | "slide";
  avoidTransformConflicts?: boolean;
  disabled?: boolean;
  debounceMs?: number;
}

const TabTransition: React.FC<TabTransitionProps> = ({
  children,
  activeKey,
  direction = "slide",
  avoidTransformConflicts = false,
  disabled = false,
  debounceMs = 0,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [displayChildren, setDisplayChildren] = useState(children);
  const [lastActiveKey, setLastActiveKey] = useState(activeKey);

  useEffect(() => {
    if (disabled) {
      setDisplayChildren(children);
      setIsVisible(true);
      return;
    }

    // Animate only when the activeKey changes
    if (activeKey !== lastActiveKey) {
      setIsVisible(false);

      const timer = setTimeout(() => {
        setLastActiveKey(activeKey);
        setDisplayChildren(children);
        setIsVisible(true);
      }, 150); // Should match the fade-out duration

      return () => clearTimeout(timer);
    } else {
      // If the key is the same, but children changed (e.g., filter update),
      // just update the content without animating and ensure it's visible.
      setDisplayChildren(children);
      setIsVisible(true);
    }
  }, [activeKey, children, disabled, lastActiveKey]);

  const getTransitionClasses = () => {
    if (disabled) {
      return "";
    }

    if (direction === "fade" || avoidTransformConflicts) {
      return `transition-opacity duration-300 ease-in-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`;
    }

    // Default slide animation
    return `transition-all duration-300 ease-out ${
      isVisible
        ? "opacity-100 translate-y-0 scale-100"
        : "opacity-0 translate-y-4 scale-95"
    }`;
  };

  return <div className={getTransitionClasses()}>{displayChildren}</div>;
};

export default TabTransition;
