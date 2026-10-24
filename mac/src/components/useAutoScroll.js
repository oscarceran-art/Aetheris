import { useEffect, useRef, useState } from "react";

// Follow the bottom while content grows, unless the user scrolled up
export const useAutoScroll = () => {
  const ref = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  useEffect(() => {
    const el = ref.current;
    const inner = el?.firstElementChild;
    if (!inner) return;
    let stick = true;
    const onScroll = () => {
      const s = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      if (s !== stick) setAtBottom((stick = s));
    };
    const ro = new ResizeObserver(() => stick && (el.scrollTop = el.scrollHeight));
    el.addEventListener("scroll", onScroll);
    ro.observe(inner);
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, []);
  const toBottom = () => ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  return { ref, atBottom, toBottom };
};
