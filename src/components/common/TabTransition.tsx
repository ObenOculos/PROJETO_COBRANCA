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

    // If debouncing is enabled and activeKey hasn't changed, just update children without animation
    if (debounceMs > 0 && activeKey === lastActiveKey) {
      setDisplayChildren(children);
      return;
    }

    // Update the last active key
    setLastActiveKey(activeKey);

    // Fade out current content
    setIsVisible(false);

    // Wait for fade out to complete, then update content and fade in
    const timer = setTimeout(() => {
      setDisplayChildren(children);
      setIsVisible(true);
    }, 150);

    return () => clearTimeout(timer);
  }, [activeKey, children, disabled, debounceMs, lastActiveKey]);

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
