import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalRef {
  write: (data: string) => void;
  clear: () => void;
}

export const Terminal = forwardRef<TerminalRef, {}>((_, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      xtermRef.current?.write(data);
    },
    clear: () => {
      xtermRef.current?.clear();
    }
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

    // Check if terminal is already initialized
    if (xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: '#111827', // matching gray-900
        foreground: '#ffffff',
      },
      fontFamily: 'monospace',
      fontSize: 12,
      convertEol: true, // Useful for proper line endings
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    // Also fit after a short delay to ensure layout is settled
    const timer = setTimeout(() => fitAddon.fit(), 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Re-fit when the component might have been resized (e.g. split pane change)
  useEffect(() => {
      const observer = new ResizeObserver(() => {
          fitAddonRef.current?.fit();
      });
      if (terminalRef.current) {
          observer.observe(terminalRef.current);
      }
      return () => observer.disconnect();
  }, []);

  return <div ref={terminalRef} className="w-full h-full overflow-hidden bg-gray-900" />;
});

Terminal.displayName = 'Terminal';
