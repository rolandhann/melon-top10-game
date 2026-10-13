const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.melon.com/',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function fetchChart(url, limit = 100) {
  const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(data);
  const songs = [];

  $('#frm tbody tr').each((i, el) => {
    if (songs.length >= limit) return false;

    const name = $(el).find('.ellipsis.rank01 strong a').text().trim();
    const artist = $(el).find('.ellipsis.rank02 .checkEllipsis').text().trim();
    if (!name) return;

    const rank = songs.length + 1;

    let trend = 'NONE';
    let prevRank = rank;

    if ($(el).find('.icon_new').length) {
      trend = 'NEW';
      prevRank = 0;
    } else if ($(el).find('.icon_rankup').length) {
      trend = 'UP';
      const delta = parseInt($(el).find('.icon_rankup').siblings('span').text().trim()) || 0;
      prevRank = rank + delta;
    } else if ($(el).find('.icon_rankdown').length) {
      trend = 'DOWN';
      const delta = parseInt($(el).find('.icon_rankdown').siblings('span').text().trim()) || 0;
      prevRank = rank - delta;
    }

    songs.push([rank, name, artist, trend, prevRank]);
  });

  return songs;
}

async function main() {
  const today = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(today.getTime() + kstOffset);
  const dateStr = kst.toISOString().split('T')[0];

  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();

  // 이번 주 월~오늘 라벨
  const dow = kst.getUTCDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(kst);
  mon.setUTCDate(kst.getUTCDate() - daysToMon);
  const weekLabel = `${mon.getUTCMonth() + 1}/${mon.getUTCDate()}~${month}/${day}`;
  const dayLabel = `${month}월 ${day}일`;

  console.log(`[${dateStr}] 차트 수집 시작`);

  const [realtime, daily, weekly] = await Promise.all([
    fetchChart('https://www.melon.com/chart/index.htm', 100).catch(e => { console.error('실시간 실패:', e.message); return []; }),
    fetchChart('https://www.melon.com/chart/day/index.htm?idx=1&moved=Y', 100).catch(e => { console.error('일간 실패:', e.message); return []; }),
    fetchChart('https://www.melon.com/chart/week/index.htm', 100).catch(e => { console.error('주간 실패:', e.message); return []; }),
  ]);

  const chartData = {
    chartDate: dateStr,
    dayLabel,
    weekLabel,
    songs: realtime.slice(0, 10),
    dailySongs: daily,
    weeklySongs: weekly,
    updatedAt: kst.toISOString(),
  };

  // 기존 파일이 있으면 차트 수집 실패 시 이전 데이터 보존
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync('./chart-data.json', 'utf8')); } catch {}

  if (chartData.songs.length === 0) chartData.songs = existing.songs || [];
  if (chartData.dailySongs.length === 0) chartData.dailySongs = existing.dailySongs || [];
  if (chartData.weeklySongs.length === 0) chartData.weeklySongs = existing.weeklySongs || [];

  fs.writeFileSync('./chart-data.json', JSON.stringify(chartData, null, 2), 'utf8');
  console.log(`완료: 실시간 ${chartData.songs.length}곡, 일간 ${chartData.dailySongs.length}곡, 주간 ${chartData.weeklySongs.length}곡`);
}

main().catch(err => { console.error(err); process.exit(1); });
