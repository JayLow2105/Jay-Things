const OddsIQServices = (() => {
  const CONFIG = {
    oddsApiKey: '21de5f06a295e3dc6dc76689cef641ec',
    ballDontLieApiKey: 'd91314ba-05ef-4abc-8e06-4955bd5c4be4',
    pandaScoreApiKey: 'GPNLt8aByVhAAlvPv8KCCteCgY5KSGcLsMAzJADgkrtgwxWUlzs',
    oddsBaseUrl: 'https://api.the-odds-api.com/v4',
    ballDontLieBaseUrl: 'https://api.balldontlie.io',
    pandaScoreBaseUrl: 'https://api.pandascore.co',
    regions: 'us',
    markets: 'h2h',
  };

  const SPORTS = [
    {key:'americanfootball_nfl',label:'NFL',short:'NFL',cls:'sp-nfl',bdlLeague:'nfl'},
    {key:'basketball_nba',label:'NBA',short:'NBA',cls:'sp-nba',bdlLeague:'nba'},
    {key:'baseball_mlb',label:'MLB',short:'MLB',cls:'sp-mlb',bdlLeague:'mlb'},
    {key:'icehockey_nhl',label:'NHL',short:'NHL',cls:'sp-nhl',bdlLeague:'nhl'},
    {key:'soccer_epl',label:'EPL Soccer',short:'EPL',cls:'sp-def',bdlLeague:'epl'},
    {key:'americanfootball_ncaaf',label:'NCAAF',short:'NCAAF',cls:'sp-nfl',bdlLeague:'ncaaf'},
    {key:'basketball_ncaab',label:'NCAAB',short:'NCAAB',cls:'sp-nba',bdlLeague:'ncaab'},
    {key:'esports_lol',label:'League of Legends',short:'LoL',cls:'sp-es',esportGame:'lol'},
    {key:'esports_cs2',label:'Counter-Strike 2',short:'CS2',cls:'sp-es',esportGame:'csgo'},
    {key:'esports_valorant',label:'VALORANT',short:'VAL',cls:'sp-es',esportGame:'valorant'},
    {key:'esports_dota2',label:'Dota 2',short:'DOTA',cls:'sp-es',esportGame:'dota2'},
  ];

  const DEFAULT_SETTINGS = {
    apiKey: CONFIG.oddsApiKey,
    oddsFormat:'american',
    hideHighRisk:false,
    dailyLimit:10,
    dailyUsed:0,
    weeklyLimit:50,
    weeklyUsed:0,
    activeSports:['americanfootball_nfl','basketball_nba','baseball_mlb','icehockey_nhl','esports_lol','esports_cs2','esports_valorant','esports_dota2'],
  };

  function toQuery(params) {
    return Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  async function parseJsonResponse(res, label) {
    if (res.ok) return res.json();
    let msg = `${label} ${res.status}`;
    try {
      const body = await res.json();
      if (body.message) msg += ` - ${body.message}`;
      else if (body.error) msg += ` - ${body.error}`;
    } catch {}
    throw new Error(msg);
  }

  const OddsService = {
    async fetchSportOdds(sportKey, apiKey = CONFIG.oddsApiKey) {
      const query = toQuery({
        apiKey,
        regions: CONFIG.regions,
        markets: CONFIG.markets,
        oddsFormat: 'decimal',
        dateFormat: 'iso',
      });
      const url = `${CONFIG.oddsBaseUrl}/sports/${sportKey}/odds/?${query}`;
      const res = await fetch(url);
      const data = await parseJsonResponse(res, sportKey);
      return {
        data,
        remaining: res.headers.get('x-requests-remaining'),
      };
    },

    async loadCache() {
      const res = await fetch(`odds-cache.json?v=${Date.now()}`, {cache:'no-store'});
      if (!res.ok) throw new Error(`cache ${res.status}`);
      return res.json();
    },
  };

  const BallDontLieService = {
    leagueForSport(sportKey) {
      return SPORTS.find(s => s.key === sportKey)?.bdlLeague || null;
    },

    async request(league, endpoint, params = {}) {
      if (!league) throw new Error('Missing balldontlie league');
      const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const query = toQuery(params);
      const url = `${CONFIG.ballDontLieBaseUrl}/${league}/v1${path}${query ? `?${query}` : ''}`;
      const res = await fetch(url, {
        headers: {Authorization: CONFIG.ballDontLieApiKey},
      });
      return parseJsonResponse(res, `balldontlie ${league}${path}`);
    },

    fetchTeams(sportKey) {
      return this.request(this.leagueForSport(sportKey), '/teams');
    },

    fetchGames(sportKey, params = {}) {
      return this.request(this.leagueForSport(sportKey), '/games', params);
    },

    fetchStandings(sportKey, params = {}) {
      return this.request(this.leagueForSport(sportKey), '/standings', params);
    },
  };

  const PandaScoreService = {
    gameForSport(sportKey) {
      return SPORTS.find(s => s.key === sportKey)?.esportGame || null;
    },

    isEsport(sportKey) {
      return Boolean(this.gameForSport(sportKey));
    },

    async request(game, endpoint, params = {}) {
      if (!game) throw new Error('Missing PandaScore game');
      const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const query = toQuery(params);
      const url = `${CONFIG.pandaScoreBaseUrl}/${game}${path}${query ? `?${query}` : ''}`;
      const res = await fetch(url, {
        headers: {Authorization: `Bearer ${CONFIG.pandaScoreApiKey}`},
      });
      return parseJsonResponse(res, `PandaScore ${game}${path}`);
    },

    fetchUpcomingMatches(sportKey, params = {}) {
      return this.request(this.gameForSport(sportKey), '/matches/upcoming', {
        per_page: 20,
        ...params,
      });
    },
  };

  return {CONFIG, SPORTS, DEFAULT_SETTINGS, OddsService, BallDontLieService, PandaScoreService};
})();

window.OddsIQServices = OddsIQServices;
