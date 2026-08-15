import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import { CalendarComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType } from 'echarts/core';
import { t, useI18nStore, useT } from '../../i18n';

// Register only the pieces the calendar heatmap needs — importing `echarts`
// wholesale pulls ~1 MB of unused charts into the settings chunk.
echarts.use([HeatmapChart, CalendarComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

interface HeatmapDay {
  date: string;
  level: number;
}

interface StatsData {
  heatmapDays?: HeatmapDay[];
}

const EMPTY_COLOR = '#EEF2F7';
const HEAT_COLORS = ['#F3F4F6', '#E5E7EB', '#C3C8CF', '#7C828C', '#111418'];

/** Activity heatmap redesigned with Apache ECharts (calendar heatmap). */
export default function StatsHeatmap() {
  const tPanel = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [days, setDays] = useState<HeatmapDay[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const api = window.electronAPI?.stats;
      if (!api) {
        setLoaded(true);
        return;
      }
      try {
        const result = await api.get();
        if (!cancelled && result.ok && result.data) {
          setDays((result.data as StatsData).heatmapDays ?? []);
        }
      } catch {
        // keep empty state
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || days.length === 0) return;

    const now = new Date();
    const start = new Date(now);
    start.setFullYear(now.getFullYear() - 1);
    start.setDate(start.getDate() + 1);

    const chart = echarts.init(el);
    chartRef.current = chart;
    chart.setOption({
      tooltip: {
        formatter: (params: any) => {
          const [date, level] = params.value;
          return `${date}<br/>${t('heatmap.activity', { level })}`;
        },
      },
      visualMap: {
        min: 0,
        max: 4,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 10,
        itemHeight: 80,
        text: [t('heatmap.more'), t('heatmap.less')],
        inRange: { color: HEAT_COLORS },
      },
      calendar: {
        range: [start, now],
        cellSize: ['auto', 16],
        itemStyle: {
          color: EMPTY_COLOR,
          borderWidth: 2,
          borderColor: 'transparent',
          borderRadius: 3,
        },
        splitLine: { show: false },
        dayLabel: { show: false },
        monthLabel: { nameMap: useI18nStore.getState().locale === 'en-US' ? 'en' : 'cn' },
        yearLabel: { show: false },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: days.map((d) => [d.date, d.level]),
        },
      ],
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [days]);

  return (
    <section className="mb-8 last:mb-0">
      <div className="text-2xs font-semibold text-text-muted tracking-[0.08em] pb-2 border-b border-[var(--color-border-dim)] mb-1">
        {tPanel('heatmap.title')}
      </div>
      {loaded && days.length === 0 ? (
        <div className="flex items-center justify-center h-[180px] text-sm text-text-muted">
          {tPanel('heatmap.empty')}
        </div>
      ) : (
        <div ref={containerRef} className="w-full h-[240px]" />
      )}
    </section>
  );
}
