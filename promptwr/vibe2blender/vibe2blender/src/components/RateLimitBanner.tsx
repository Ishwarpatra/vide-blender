import { useState, useEffect, useRef } from 'react';

interface RateLimitBannerProps {
  isVisible: boolean;
  retryAfterSeconds: number;
}

export const RateLimitBanner = ({ isVisible = false, retryAfterSeconds = 0 }: RateLimitBannerProps) => {
  const [timeLeft, setTimeLeft] = useState(retryAfterSeconds);
  // Track the initial value for each new rate-limit event so the progress bar is correct
  const initialRef = useRef(retryAfterSeconds);

  // Reset countdown whenever retryAfterSeconds changes (i.e., a new rate-limit error arrives)
  useEffect(() => {
    if (isVisible && retryAfterSeconds > 0) {
      setTimeLeft(retryAfterSeconds);
      initialRef.current = retryAfterSeconds;
    }
  }, [retryAfterSeconds, isVisible]);

  // Tick down once per second while the banner is visible
  useEffect(() => {
    if (!isVisible || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isVisible, timeLeft]);

  if (!isVisible) return null;

  const progressPct = initialRef.current > 0
    ? (timeLeft / initialRef.current) * 100
    : 0;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100]" role="alert" aria-live="assertive">
      <div className="bg-text text-bg py-3 px-6 flex items-center gap-4 font-bold text-sm tracking-tighter">
        <span className="bg-bg text-text px-2 py-0.5 text-[10px] animate-pulse flex-shrink-0">
          429 RATE LIMITED
        </span>
        <span className="flex-shrink-0">
          TOO MANY REQUESTS. RETRYING IN {timeLeft}S...
        </span>
        {/* Progress bar drains from full to empty as cooldown expires */}
        <div className="h-1 bg-accent/20 flex-1 relative">
          <div
            className="h-full bg-accent transition-all duration-1000"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
};
