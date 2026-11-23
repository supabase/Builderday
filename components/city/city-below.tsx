/* The parts of a city page that do not follow the clock: how the city's session runs, and the footer. Drawn on the
   server from the schedule alone. */
import { EVENT, sched, FINALIST_COUNT } from '@/lib/day-data';
import { cityIndex, type CityCfg } from '@/lib/city';
import { hhmm, tz } from '@/lib/format';
import { HowItWorksList, PageFooter } from '@/components/shared/page-parts';

export function CityHow({ c }: { c: CityCfg }) {
  const S = sched(c), x = S.cs[cityIndex(c)], nm = x.city.name, off = x.city.offset, local = (m: number) => hhmm(m + off);
  return (
    <HowItWorksList id="how-h" title={'How it works in ' + nm} first="name" steps={[
      ['Build', 'Build from ' + local(x.start) + ' to ' + local(x.buildEnd) + ', ' + nm + ' time (' + hhmm(x.start) + ' to ' + hhmm(x.buildEnd) + ' UTC).'],
      ['Vote', 'Vote from ' + local(x.start) + ' to ' + local(x.end) + ', on any project as soon as it is in. Judges add their votes to the same count. The top ' + EVENT.finalists + ' go to the final, and 1st wins the city prize.'],
      ['The final', EVENT.pickers + ' pick one of the ' + FINALIST_COUNT + ' finalists at ' + local(S.pickAt) + '. The pick wins the global prize.'],
    ]} />
  );
}

export function CityFooter({ c }: { c: CityCfg }) {
  const x = sched(c).cs[cityIndex(c)], nm = x.city.name;
  return <PageFooter><span>{EVENT.name + ' · ' + nm}</span><span>{'Times are ' + nm + ' time (' + tz(x.city.offset) + ') unless marked UTC.'}</span></PageFooter>;
}
