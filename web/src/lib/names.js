// Nombre legible para un punto del globo: lugar conocido → país (en español) → océano.
// Porta `nameAt`, `oceanName` y `PLACES` del prototipo.
import { geoContains } from 'd3'
import { feature } from 'topojson-client'
import countries110Topo from 'world-atlas/countries-110m.json'

const D2R = Math.PI / 180

export const PLACES = [
  { name: 'Guanacaste, Costa Rica', lat: 10.5, lon: -85.4 },
  { name: 'San José, Costa Rica', lat: 9.9, lon: -84.1 },
  { name: 'Corredor Seco (Honduras / El Salvador)', lat: 13.8, lon: -87.5 },
  { name: 'Ciudad de México', lat: 19.4, lon: -99.1 },
  { name: 'California, EE. UU.', lat: 36.5, lon: -119.5 },
  { name: 'Bogotá, Colombia', lat: 4.7, lon: -74.1 },
  { name: 'Amazonía (Manaos)', lat: -3.1, lon: -60 },
  { name: 'São Paulo, Brasil', lat: -23.5, lon: -46.6 },
  { name: 'Buenos Aires, Argentina', lat: -34.6, lon: -58.4 },
  { name: 'Madrid, España', lat: 40.4, lon: -3.7 },
  { name: 'Alpes (Suiza)', lat: 46.5, lon: 9 },
  { name: 'Sahel (Níger)', lat: 14, lon: 2 },
  { name: 'Nueva Delhi, India', lat: 28.6, lon: 77.2 },
  { name: 'Pekín, China', lat: 39.9, lon: 116.4 },
  { name: 'Siberia (Yakutsk)', lat: 62, lon: 129.7 },
  { name: 'Atlántico Norte (Islandia)', lat: 56, lon: -33 },
  { name: 'Ártico (Svalbard)', lat: 78, lon: 16 },
  { name: 'Sídney, Australia', lat: -33.9, lon: 151.2 }
]

// Nombres en español por código ISO 3166-1 numérico (ids de world-atlas).
const NAMES_ES = {
  '004': 'Afganistán', '008': 'Albania', '010': 'Antártida', '012': 'Argelia', '024': 'Angola', '031': 'Azerbaiyán',
  '032': 'Argentina', '036': 'Australia', '040': 'Austria', '044': 'Bahamas', '050': 'Bangladesh', '051': 'Armenia',
  '056': 'Bélgica', '064': 'Bután', '068': 'Bolivia', '070': 'Bosnia y Herzegovina', '072': 'Botsuana', '076': 'Brasil',
  '084': 'Belice', '090': 'Islas Salomón', '096': 'Brunéi', '100': 'Bulgaria', '104': 'Myanmar', '108': 'Burundi',
  '112': 'Bielorrusia', '116': 'Camboya', '120': 'Camerún', '124': 'Canadá', '140': 'República Centroafricana',
  '144': 'Sri Lanka', '148': 'Chad', '152': 'Chile', '156': 'China', '158': 'Taiwán', '170': 'Colombia', '178': 'Congo',
  '180': 'República Democrática del Congo', '188': 'Costa Rica', '191': 'Croacia', '192': 'Cuba', '196': 'Chipre',
  '203': 'Chequia', '204': 'Benín', '208': 'Dinamarca', '214': 'República Dominicana', '218': 'Ecuador',
  '222': 'El Salvador', '226': 'Guinea Ecuatorial', '231': 'Etiopía', '232': 'Eritrea', '233': 'Estonia',
  '238': 'Islas Malvinas', '242': 'Fiyi', '246': 'Finlandia', '250': 'Francia', '260': 'Tierras Australes Francesas',
  '262': 'Yibuti', '266': 'Gabón', '268': 'Georgia', '270': 'Gambia', '275': 'Palestina', '276': 'Alemania', '288': 'Ghana',
  '300': 'Grecia', '304': 'Groenlandia', '320': 'Guatemala', '324': 'Guinea', '328': 'Guyana', '332': 'Haití',
  '340': 'Honduras', '348': 'Hungría', '352': 'Islandia', '356': 'India', '360': 'Indonesia', '364': 'Irán', '368': 'Irak',
  '372': 'Irlanda', '376': 'Israel', '380': 'Italia', '384': 'Costa de Marfil', '388': 'Jamaica', '392': 'Japón',
  '398': 'Kazajistán', '400': 'Jordania', '404': 'Kenia', '408': 'Corea del Norte', '410': 'Corea del Sur', '414': 'Kuwait',
  '417': 'Kirguistán', '418': 'Laos', '422': 'Líbano', '426': 'Lesoto', '428': 'Letonia', '430': 'Liberia', '434': 'Libia',
  '440': 'Lituania', '442': 'Luxemburgo', '450': 'Madagascar', '454': 'Malaui', '458': 'Malasia', '466': 'Malí',
  '478': 'Mauritania', '484': 'México', '496': 'Mongolia', '498': 'Moldavia', '499': 'Montenegro', '504': 'Marruecos',
  '508': 'Mozambique', '512': 'Omán', '516': 'Namibia', '524': 'Nepal', '528': 'Países Bajos', '540': 'Nueva Caledonia',
  '548': 'Vanuatu', '554': 'Nueva Zelanda', '558': 'Nicaragua', '562': 'Níger', '566': 'Nigeria', '578': 'Noruega',
  '586': 'Pakistán', '591': 'Panamá', '598': 'Papúa Nueva Guinea', '600': 'Paraguay', '604': 'Perú', '608': 'Filipinas',
  '616': 'Polonia', '620': 'Portugal', '624': 'Guinea-Bisáu', '626': 'Timor Oriental', '630': 'Puerto Rico', '634': 'Catar',
  '642': 'Rumania', '643': 'Rusia', '646': 'Ruanda', '682': 'Arabia Saudita', '686': 'Senegal', '688': 'Serbia',
  '694': 'Sierra Leona', '703': 'Eslovaquia', '704': 'Vietnam', '705': 'Eslovenia', '706': 'Somalia', '710': 'Sudáfrica',
  '716': 'Zimbabue', '724': 'España', '728': 'Sudán del Sur', '729': 'Sudán', '732': 'Sahara Occidental', '740': 'Surinam',
  '748': 'Esuatini', '752': 'Suecia', '756': 'Suiza', '760': 'Siria', '762': 'Tayikistán', '764': 'Tailandia', '768': 'Togo',
  '780': 'Trinidad y Tobago', '784': 'Emiratos Árabes Unidos', '788': 'Túnez', '792': 'Turquía', '795': 'Turkmenistán',
  '800': 'Uganda', '804': 'Ucrania', '807': 'Macedonia del Norte', '818': 'Egipto', '826': 'Reino Unido', '834': 'Tanzania',
  '840': 'Estados Unidos', '854': 'Burkina Faso', '858': 'Uruguay', '860': 'Uzbekistán', '862': 'Venezuela', '887': 'Yemen',
  '894': 'Zambia'
}
const NAMES_NO_ID = { 'N. Cyprus': 'Chipre del Norte', Somaliland: 'Somalilandia', Kosovo: 'Kosovo' }

const COUNTRIES = feature(countries110Topo, countries110Topo.objects.countries).features
const countryName = f => NAMES_ES[f.id] || NAMES_NO_ID[f.properties.name] || f.properties.name

/** Distancia de gran círculo en km. */
export function km (a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R
  return 6371 * Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)))
}

export function oceanName (la, lo) {
  if (la > 66) return 'Océano Ártico'
  if (la < -58) return 'Océano Antártico'
  // Caribe y Golfo: al este de la costa pacífica de Centroamérica (≈ de Panamá, 77.5°O/8°N, a Jalisco, 105°O/20°N).
  // El prototipo no tenía esta condición y llamaba «Mar Caribe» al Pacífico frente a Guatemala.
  const pacificCoast = la <= 20 ? -77 - (la - 8) * 2.3 : -98
  if (lo > -100 && lo < -60 && la > 8 && la < 31 && lo > pacificCoast) return la > 18 && lo < -81 ? 'Golfo de México' : 'Mar Caribe'
  if (lo > -5 && lo < 37 && la > 30 && la < 46) return 'Mar Mediterráneo'
  if (lo >= 20 && lo < 120 && la < 30) return 'Océano Índico'
  if ((lo >= -70 && lo < 20) || (lo >= -100 && lo < -70 && la > 8 && la < 60 && lo > pacificCoast)) return la >= 0 ? 'Atlántico Norte' : 'Atlántico Sur'
  return la >= 0 ? 'Pacífico Norte' : 'Pacífico Sur'
}

/**
 * Nombre para (lat, lon). Con exact = true (clic del usuario) se usa un radio menor
 * y solo el país que contiene el punto; si no, se buscan países vecinos.
 */
export function nameAt (lat, lon, exact = false) {
  let best = null, bd = Infinity
  for (const p of PLACES) { const d = km(p, { lat, lon }); if (d < bd) { bd = d; best = p } }
  if (bd < (exact ? 250 : 420)) return best.name
  const offs = exact ? [[0, 0]] : [[0, 0], [0, 3], [0, -3], [3, 0], [-3, 0], [3, 3], [-3, -3], [3, -3], [-3, 3]]
  for (const [a, b] of offs) {
    const f = COUNTRIES.find(f => geoContains(f, [lon + b, lat + a]))
    if (f) return countryName(f)
  }
  return oceanName(lat, lon)
}
