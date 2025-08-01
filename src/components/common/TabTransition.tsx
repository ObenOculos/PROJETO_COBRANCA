import React, { useEffect, useState } from "react";

interface TabTransitionProps {
  children: React.ReactNode;
  activeKey: string;
  direction?: "fade" | "slide";
  avoidTransformConflicts?: boolean;
  disabled?: boolean;
}

const TabTransition: React.FC<TabTransitionProps> = ({
  children,
  activeKey,
  direction = "slide",
  avoidTransformConflicts = false,
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [displayChildren, setDisplayChildren] = useState(children);

  useEffect(() => {
    if (disabled) {
      setDisplayChildren(children);
      setIsVisible(true);
      return;
    }

    // Fade out current content
    setIsVisible(false);

    // Wait for fade out to complete, then update content and fade in
    const timer = setTimeout(() => {
      setDisplayChildren(children);
      setIsVisible(true);
    }, 150);

    return () => clearTimeout(timer);
  }, [activeKey, children, disabled]);

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
