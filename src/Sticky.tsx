import React, { useEffect, useRef, useState } from "react";

const throttle = (func: (...args: unknown[]) => void, wait: number) => {
  let lastCallTime: number | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: unknown[]) => {
    const now = Date.now();

    if (lastCallTime === null || now - lastCallTime >= wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastCallTime = now;
      func(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastCallTime = Date.now();
        func(...args);
        timeout = null;
      }, wait - (now - lastCallTime));
    }
  };
};


const findScrollableAncestor = (element: HTMLElement | null): HTMLElement | Window => {
  while (element) {
    const overflowY = globalThis.getComputedStyle(element).overflowY;
    if (overflowY === "scroll" || overflowY === "auto") {
      return element;
    }
    element = element.parentElement;
  }
  return window;
};

const Sticky: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stickyRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const handleScroll = throttle(() => {
      if (stickyRef.current) {
        const offset = stickyRef.current.getBoundingClientRect().top;
        setIsStuck(offset <= 8); // TODO: this is tied to the padding
      }
    }, 100);

    const scrollableAncestor = findScrollableAncestor(stickyRef.current?.parentElement || null);

    scrollableAncestor.addEventListener("scroll", handleScroll);
    return () => {
      scrollableAncestor.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div
      ref={stickyRef}
      className={`sticky${isStuck ? " stuck" : ""}`}
      style={{
        position: "sticky",
        top: 0,
      }}
    >
      {children}
    </div>
  );
};

export default Sticky;
