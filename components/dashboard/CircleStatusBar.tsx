'use client';

import { useState } from 'react';

type Status = 'Invited' | 'On-boarding' | 'Pipeline' | 'Active' | 'Follow-Up' | 'Paused' | 'Off-Boarding' | 'Recording';

interface StatusData {
  status: 'Invited' | 'On-boarding' | 'Pipeline' | 'Active' | 'Follow-Up' | 'Paused' | 'Off-Boarding';
  count: number;
  color: string;
}

interface CircleStatusBarProps {
  data: StatusData[];
  total: number;
  onStatusClick: (status: Status) => void;
}

interface TooltipData {
  status: Status;
  count: number;
  x: number;
  y: number;
}

export default function CircleStatusBar({ data, total, onStatusClick }: CircleStatusBarProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Calculate percentages for each status
  const statusWithPercentages = data.map(item => ({
    ...item,
    percentage: total > 0 ? (item.count / total) * 100 : 0
  }));

  // Filter out statuses with 0 count for the bar
  const visibleStatuses = statusWithPercentages.filter(item => item.count > 0);

  const handleSegmentHover = (event: React.MouseEvent, statusData: StatusData) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    setTooltip({
      status: statusData.status,
      count: statusData.count,
      x: centerX,
      y: rect.top - 10
    });
  };

  const handleSegmentLeave = () => {
    setTooltip(null);
  };

  const handleSegmentClick = (status: Status) => {
    onStatusClick(status);
    setTooltip(null);
  };

  // Get color for legend (extract the color class without bg- prefix for border/text)
  const getColorVariant = (colorClass: string) => {
    return colorClass.replace('bg-', '');
  };

  return (
    <div className="w-full">
      {/* Status Bar */}
      <div className="relative">
        <div className="flex w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden shadow-sm">
          {visibleStatuses.map((statusData, index) => (
            <div
              key={statusData.status}
              className={`${statusData.color} hover:brightness-110 cursor-pointer transition-all duration-200 ease-in-out relative group`}
              style={{ width: `${statusData.percentage}%` }}
              onMouseEnter={(e) => handleSegmentHover(e, statusData)}
              onMouseLeave={handleSegmentLeave}
              onClick={() => handleSegmentClick(statusData.status)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSegmentClick(statusData.status);
                }
              }}
              aria-label={`${statusData.status}: ${statusData.count} leaders`}
            >
              {/* Subtle border between segments */}
              {index > 0 && (
                <div className="absolute left-0 top-0 w-px h-full bg-white/20"></div>
              )}
              
              {/* Show count if segment is wide enough */}
              {statusData.percentage > 8 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-white drop-shadow-sm">
                    {statusData.count}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Total count display */}
        <div className="flex justify-between items-center mt-2 text-sm text-gray-600 dark:text-gray-400">
          <span>Circle Leaders</span>
          <span className="font-medium">{total} total</span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {statusWithPercentages.map((statusData) => (
          <div
            key={statusData.status}
            className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
            onClick={() => handleSegmentClick(statusData.status)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSegmentClick(statusData.status);
              }
            }}
          >
            <div 
              className={`w-3 h-3 rounded-full ${statusData.color} flex-shrink-0`}
              aria-hidden="true"
            ></div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-900 dark:text-white truncate">
                {statusData.status}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {statusData.count} ({statusData.percentage.toFixed(1)}%)
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className="font-medium">{tooltip.status}</div>
          <div className="text-gray-200">{tooltip.count} leaders</div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
}
