import { formatPracticed } from '@jam-practice/core/practiceMinutes';
import { NAV_LINKS_DATA } from '@jam-practice/core/navLinks';
import { Text, View } from 'react-native';

import { NAV_LINK_ICONS } from '@/components/icons';
import { Panel, Section, SmallButton } from '@/components/shedLog/parts';
import { toastNow } from '@/lib/shedLogCelebrations';
import { logToolToday, toolLabel, unloggedToday, useLiveToolTimes } from '@/lib/toolTime';
import { useToolUsage } from '@/lib/toolUsage';
import { useToday } from '@/lib/useClock';
import { useAppTheme } from '@/theme/ThemeProvider';

const CATEGORY_OF = new Map(NAV_LINKS_DATA.map((l) => [l.href, l.category]));

/**
 * Today's time in tools that isn't in the Shed Log yet, with a Log button for each — the phone's
 * stand-in for the website's per-tool "Log N min · to Shed Log" button (every tool's time reaches
 * the Shed Log only when you log it, as on the website). Shows nothing when there's nothing to log.
 */
export function ToolTimeCard({ icon, sounds }: { icon?: React.ReactNode; sounds: boolean }) {
  const { colors, derived } = useAppTheme();
  const [usage, ready] = useToolUsage();
  const live = useLiveToolTimes();
  const today = useToday();
  if (!ready) return null;
  const hrefs = [...new Set([...Object.keys(usage).filter((h) => usage[h]?.[today]), ...Object.keys(live)])];
  const rows = hrefs
    .map((href) => ({ href, ms: unloggedToday(usage, href, live[href] ?? 0) }))
    .filter((r) => r.ms >= 60000 || (r.ms >= 1000 && (live[r.href] ?? 0) > 0))
    .sort((a, b) => b.ms - a.ms);
  if (!rows.length) return null;
  return (
    <Section icon={icon} title="Time in tools" count={rows.length}>
      <Panel>
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          Time you spent in tools today. Log it to add it to your practice.
        </Text>
        {rows.map(({ href, ms }) => {
          const Icon = NAV_LINK_ICONS[href];
          const cat = CATEGORY_OF.get(href);
          return (
            <View key={href} className="min-h-[48px] flex-row items-center gap-3 rounded-lg px-3 py-1.5" style={{ backgroundColor: derived.fill }}>
              {Icon ? <Icon color={cat ? derived.category[cat] : colors.muted} size={20} /> : null}
              <View className="flex-1">
                <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                  {toolLabel(href)}
                </Text>
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  {formatPracticed(ms / 60000)} not logged yet
                </Text>
              </View>
              <SmallButton
                label={`Log ${formatPracticed(ms / 60000)}`}
                primary
                onPress={() => {
                  const logged = logToolToday(usage, href);
                  if (logged) toastNow(`Logged ${formatPracticed(logged / 60000)}`, `${toolLabel(href)} time is in your Shed Log.`, sounds);
                }}
              />
            </View>
          );
        })}
      </Panel>
    </Section>
  );
}
