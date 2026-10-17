import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** 鼠标距屏幕上下边缘多近时浮出信息栏（px） */
const HOT_ZONE = 8;

/**
 * 沉浸式答题：顶部 / 底部信息栏默认收起，鼠标靠近屏幕上下边缘时浮出；
 * 鼠标停留在信息栏范围内则保持展开
 */
export function useImmersiveBars(
  enabled: boolean,
  headerRef: RefObject<HTMLElement | null>,
  footerRef: RefObject<HTMLElement | null>,
) {
  const [topVisible, setTopVisible] = useState(false);
  const [bottomVisible, setBottomVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setTopVisible(false);
      setBottomVisible(false);
      return;
    }

    const onMove = (e: MouseEvent) => {
      const y = e.clientY;
      const fromBottom = window.innerHeight - y;
      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      const footerHeight = footerRef.current?.offsetHeight ?? 0;
      setTopVisible((open) => y <= HOT_ZONE || (open && y <= headerHeight));
      setBottomVisible((open) => fromBottom <= HOT_ZONE || (open && fromBottom <= footerHeight));
    };

    const hideAll = () => {
      setTopVisible(false);
      setBottomVisible(false);
    };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', hideAll);
    window.addEventListener('blur', hideAll);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', hideAll);
      window.removeEventListener('blur', hideAll);
    };
  }, [enabled, footerRef, headerRef]);

  return { topVisible, bottomVisible };
}
