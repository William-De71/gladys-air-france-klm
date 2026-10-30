// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, statuses, departure and arrival texts,
// widget contents, scene summaries, messages of the Configuration screen.
// Vocabulary of the Gladys interface (appareil / Gerät / dispositivo, scène /
// Szene / escena) and of airports (porte / Gate / puerta, tapis à bagages /
// Gepäckband / cinta). Airport codes and flight numbers stay as airlines
// write them.
// -----------------------------------------------------------------------------

import { airportClock } from './time.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];
const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

const TEXTS = {
  // devices
  deviceName: {
    en: 'Flight {flight} · {date}',
    fr: 'Vol {flight} · {date}',
    de: 'Flug {flight} · {date}',
    es: 'Vuelo {flight} · {date}',
  },
  deviceNameRoute: {
    en: 'Flight {flight} {route} · {date}',
    fr: 'Vol {flight} {route} · {date}',
    de: 'Flug {flight} {route} · {date}',
    es: 'Vuelo {flight} {route} · {date}',
  },
  featureStatus: {
    en: 'Flight status',
    fr: 'Statut du vol',
    de: 'Flugstatus',
    es: 'Estado del vuelo',
  },
  featureDeparture: {
    en: 'Departure',
    fr: 'Départ',
    de: 'Abflug',
    es: 'Salida',
  },
  featureArrival: {
    en: 'Arrival',
    fr: 'Arrivée',
    de: 'Ankunft',
    es: 'Llegada',
  },
  featureDepartureDelay: {
    en: 'Departure delay',
    fr: 'Retard au départ',
    de: 'Abflugverspätung',
    es: 'Retraso en la salida',
  },
  featureArrivalDelay: {
    en: 'Arrival delay',
    fr: 'Retard à l’arrivée',
    de: 'Ankunftsverspätung',
    es: 'Retraso en la llegada',
  },
  // statuses
  status_on_time: { en: 'On time', fr: 'À l’heure', de: 'Pünktlich', es: 'A tiempo' },
  status_delayed: { en: 'Delayed', fr: 'Retardé', de: 'Verspätet', es: 'Retrasado' },
  status_departed: { en: 'In flight', fr: 'En vol', de: 'In der Luft', es: 'En vuelo' },
  status_arrived: { en: 'Landed', fr: 'Arrivé', de: 'Gelandet', es: 'Aterrizado' },
  status_cancelled: { en: 'Cancelled', fr: 'Annulé', de: 'Annulliert', es: 'Cancelado' },
  status_diverted: { en: 'Diverted', fr: 'Dérouté', de: 'Umgeleitet', es: 'Desviado' },
  status_not_found: {
    en: 'Not published',
    fr: 'Non publié',
    de: 'Unveröffentlicht',
    es: 'Aún no publicado',
  },
  // departure and arrival texts
  scheduledAt: {
    en: 'scheduled {time}',
    fr: 'prévu {time}',
    de: 'geplant {time}',
    es: 'prevista {time}',
  },
  gate: { en: 'gate {gate}', fr: 'porte {gate}', de: 'Gate {gate}', es: 'puerta {gate}' },
  belt: { en: 'belt {belt}', fr: 'tapis {belt}', de: 'Gepäckband {belt}', es: 'cinta {belt}' },
  terminal: { en: 'T{terminal}', fr: 'T{terminal}', de: 'T{terminal}', es: 'T{terminal}' },
  terminalLetter: {
    en: 'terminal {terminal}',
    fr: 'terminal {terminal}',
    de: 'Terminal {terminal}',
    es: 'terminal {terminal}',
  },
  unknownTime: { en: 'unknown', fr: 'inconnu', de: 'unbekannt', es: 'desconocida' },
  minutesLate: {
    en: '+{minutes} min',
    fr: '+{minutes} min',
    de: '+{minutes} Min.',
    es: '+{minutes} min',
  },
  minutesEarly: {
    en: '−{minutes} min',
    fr: '−{minutes} min',
    de: '−{minutes} Min.',
    es: '−{minutes} min',
  },
  // scene summaries
  summary: {
    en: 'Flight {flight} {route}: {status}. Departure {departure}. Arrival {arrival}.',
    fr: 'Vol {flight} {route} : {status}. Départ {departure}. Arrivée {arrival}.',
    de: 'Flug {flight} {route}: {status}. Abflug {departure}. Ankunft {arrival}.',
    es: 'Vuelo {flight} {route}: {status}. Salida {departure}. Llegada {arrival}.',
  },
  summaryNotFound: {
    en: 'Flight {flight} of {date}: not published yet by Air France-KLM.',
    fr: 'Vol {flight} du {date} : pas encore publié par Air France-KLM.',
    de: 'Flug {flight} vom {date}: von Air France-KLM noch nicht veröffentlicht.',
    es: 'Vuelo {flight} del {date}: aún no publicado por Air France-KLM.',
  },
  summaryReason: {
    en: '{summary} {reason}',
    fr: '{summary} {reason}',
    de: '{summary} {reason}',
    es: '{summary} {reason}',
  },
  delaySummary: {
    en: 'Flight {flight} {route}: delay {delay} (before: {previous}). Departure {departure}. Arrival {arrival}.',
    fr: 'Vol {flight} {route} : retard {delay} (avant : {previous}). Départ {departure}. Arrivée {arrival}.',
    de: 'Flug {flight} {route}: Verspätung {delay} (vorher: {previous}). Abflug {departure}. Ankunft {arrival}.',
    es: 'Vuelo {flight} {route}: retraso {delay} (antes: {previous}). Salida {departure}. Llegada {arrival}.',
  },
  gateSummary: {
    en: 'Flight {flight} {route}: gate {gate}{terminal}, departure {time}.',
    fr: 'Vol {flight} {route} : porte {gate}{terminal}, départ {time}.',
    de: 'Flug {flight} {route}: Gate {gate}{terminal}, Abflug {time}.',
    es: 'Vuelo {flight} {route}: puerta {gate}{terminal}, salida {time}.',
  },
  gateSummaryChanged: {
    en: 'Flight {flight} {route}: gate changed from {previous} to {gate}{terminal}, departure {time}.',
    fr: 'Vol {flight} {route} : changement de porte, {previous} → {gate}{terminal}, départ {time}.',
    de: 'Flug {flight} {route}: Gatewechsel von {previous} zu {gate}{terminal}, Abflug {time}.',
    es: 'Vuelo {flight} {route}: cambio de puerta de {previous} a {gate}{terminal}, salida {time}.',
  },
  onTime: { en: 'on time', fr: 'à l’heure', de: 'pünktlich', es: 'a tiempo' },
  // configuration screen
  testOk: {
    en: 'Connection OK: the key is accepted. {used} of {limit} calls used today.',
    fr: 'Connexion OK : la clé est acceptée. {used} requêtes sur {limit} utilisées aujourd’hui.',
    de: 'Verbindung OK: Der Schlüssel wird akzeptiert. Heute {used} von {limit} Abfragen genutzt.',
    es: 'Conexión correcta: la clave es aceptada. {used} de {limit} consultas usadas hoy.',
  },
  flightAdded: {
    en: '{flight} of {date} followed: {status}. Add its device in the Discovery tab.',
    fr: '{flight} du {date} suivi : {status}. Ajoutez son appareil dans l’onglet Découverte.',
    de: '{flight} vom {date} wird verfolgt: {status}. Fügen Sie sein Gerät im Tab Erkennung hinzu.',
    es: '{flight} del {date} en seguimiento: {status}. Añada su dispositivo en la pestaña Descubrimiento.',
  },
  flightAddedNotFound: {
    en: '{flight} of {date} followed. Air France-KLM has not published it yet (a few days before departure): it will be read again regularly. Add its device in the Discovery tab.',
    fr: '{flight} du {date} suivi. Air France-KLM ne l’a pas encore publié (quelques jours avant le départ) : il sera relu régulièrement. Ajoutez son appareil dans l’onglet Découverte.',
    de: '{flight} vom {date} wird verfolgt. Air France-KLM hat ihn noch nicht veröffentlicht (einige Tage vor Abflug): Er wird regelmäßig neu gelesen. Fügen Sie sein Gerät im Tab Erkennung hinzu.',
    es: '{flight} del {date} en seguimiento. Air France-KLM aún no lo ha publicado (unos días antes de la salida): se volverá a leer con regularidad. Añada su dispositivo en la pestaña Descubrimiento.',
  },
  flightAddedLater: {
    en: '{flight} of {date} followed. It will be read as soon as the daily limit of calls allows. Add its device in the Discovery tab.',
    fr: '{flight} du {date} suivi. Il sera lu dès que la limite quotidienne de requêtes le permettra. Ajoutez son appareil dans l’onglet Découverte.',
    de: '{flight} vom {date} wird verfolgt. Er wird gelesen, sobald das Tageslimit der Abfragen es erlaubt. Fügen Sie sein Gerät im Tab Erkennung hinzu.',
    es: '{flight} del {date} en seguimiento. Se leerá en cuanto el límite diario de consultas lo permita. Añada su dispositivo en la pestaña Descubrimiento.',
  },
  flightRemoved: {
    en: '{flight} of {date} is no longer followed. Its device stays until you delete it.',
    fr: '{flight} du {date} n’est plus suivi. Son appareil reste jusqu’à ce que vous le supprimiez.',
    de: '{flight} vom {date} wird nicht mehr verfolgt. Sein Gerät bleibt, bis Sie es löschen.',
    es: '{flight} del {date} ya no está en seguimiento. Su dispositivo permanece hasta que lo elimine.',
  },
  flightsNone: {
    en: 'No flight followed. Press "Follow a flight".',
    fr: 'Aucun vol suivi. Appuyez sur « Suivre un vol ».',
    de: 'Kein Flug verfolgt. Drücken Sie „Flug verfolgen“.',
    es: 'Ningún vuelo en seguimiento. Pulse «Seguir un vuelo».',
  },
  flightsList: {
    en: '{count} flight(s) followed, {used} of {limit} calls used today:',
    fr: '{count} vol(s) suivi(s), {used} requêtes sur {limit} utilisées aujourd’hui :',
    de: '{count} Flug/Flüge verfolgt, heute {used} von {limit} Abfragen genutzt:',
    es: '{count} vuelo(s) en seguimiento, {used} de {limit} consultas usadas hoy:',
  },
  flightLine: {
    en: '{index}. {flight} · {date}{route} · {status}',
    fr: '{index}. {flight} · {date}{route} · {status}',
    de: '{index}. {flight} · {date}{route} · {status}',
    es: '{index}. {flight} · {date}{route} · {status}',
  },
  notReadYet: {
    en: 'not read yet',
    fr: 'pas encore lu',
    de: 'nicht gelesen',
    es: 'aún no leído',
  },
  // connection status
  statusOk: {
    en: '{count} flight(s) followed · {used}/{limit} calls today',
    fr: '{count} vol(s) suivi(s) · {used}/{limit} requêtes aujourd’hui',
    de: '{count} Flug/Flüge verfolgt · {used}/{limit} Abfragen heute',
    es: '{count} vuelo(s) en seguimiento · {used}/{limit} consultas hoy',
  },
  statusNoFlight: {
    en: 'Ready: follow a flight with the "Follow a flight" button',
    fr: 'Prêt : suivez un vol avec le bouton « Suivre un vol »',
    de: 'Bereit: Verfolgen Sie einen Flug mit der Schaltfläche „Flug verfolgen“',
    es: 'Listo: siga un vuelo con el botón «Seguir un vuelo»',
  },
  statusNoKey: {
    en: 'Enter the API key of your Air France-KLM application',
    fr: 'Saisissez la clé d’API de votre application Air France-KLM',
    de: 'Geben Sie den API-Schlüssel Ihrer Air-France-KLM-Anwendung ein',
    es: 'Introduzca la clave de API de su aplicación Air France-KLM',
  },
  // errors
  errorNoKey: {
    en: 'No API key: enter the key of your application on developer.airfranceklm.com, then save.',
    fr: 'Pas de clé d’API : saisissez la clé de votre application sur developer.airfranceklm.com, puis enregistrez.',
    de: 'Kein API-Schlüssel: Geben Sie den Schlüssel Ihrer Anwendung auf developer.airfranceklm.com ein und speichern Sie.',
    es: 'Sin clave de API: introduzca la clave de su aplicación en developer.airfranceklm.com y guarde.',
  },
  errorAuth: {
    en: 'Key refused ({detail}): check it, and that your application is active and subscribed to Flight Status.',
    fr: 'Clé refusée ({detail}) : vérifiez-la, et que votre application est active et abonnée à Flight Status.',
    de: 'Schlüssel abgelehnt ({detail}): Prüfen Sie ihn und ob Ihre Anwendung aktiv und für Flight Status freigeschaltet ist.',
    es: 'Clave rechazada ({detail}): compruébela, y que su aplicación esté activa y suscrita a Flight Status.',
  },
  errorQuota: {
    en: 'Air France-KLM refuses more calls for now (quota of the key): new try later.',
    fr: 'Air France-KLM refuse d’autres requêtes pour l’instant (quota de la clé) : nouvel essai plus tard.',
    de: 'Air France-KLM lehnt vorerst weitere Abfragen ab (Kontingent des Schlüssels): neuer Versuch später.',
    es: 'Air France-KLM rechaza más consultas por ahora (cuota de la clave): nuevo intento más tarde.',
  },
  errorBudget: {
    en: 'Daily limit reached ({limit} calls): the flights will be read again tomorrow (UTC).',
    fr: 'Limite quotidienne atteinte ({limit} requêtes) : les vols seront relus demain (UTC).',
    de: 'Tageslimit erreicht ({limit} Abfragen): Die Flüge werden morgen (UTC) neu gelesen.',
    es: 'Límite diario alcanzado ({limit} consultas): los vuelos se volverán a leer mañana (UTC).',
  },
  errorUnreachable: {
    en: 'Air France-KLM unreachable: {detail}',
    fr: 'Air France-KLM injoignable : {detail}',
    de: 'Air France-KLM nicht erreichbar: {detail}',
    es: 'Air France-KLM inaccesible: {detail}',
  },
  errorFlightNumber: {
    en: '"{value}" is not a flight number: type the airline code and the number, like AF1234 or KL 1008.',
    fr: '« {value} » n’est pas un numéro de vol : tapez le code de la compagnie et le numéro, comme AF1234 ou KL 1008.',
    de: '„{value}“ ist keine Flugnummer: Geben Sie den Airline-Code und die Nummer ein, z. B. AF1234 oder KL 1008.',
    es: '«{value}» no es un número de vuelo: escriba el código de la aerolínea y el número, como AF1234 o KL 1008.',
  },
  errorDate: {
    en: '"{value}" is not a date: type 2026-11-06, 06/11, today, tomorrow or +3.',
    fr: '« {value} » n’est pas une date : tapez 06/11/2026, 06/11, aujourd’hui, demain ou +3.',
    de: '„{value}“ ist kein Datum: Geben Sie 06.11.2026, 06/11, heute, morgen oder +3 ein.',
    es: '«{value}» no es una fecha: escriba 06/11/2026, 06/11, hoy, mañana o +3.',
  },
  errorDateRange: {
    en: 'Give a date from yesterday to one year ahead.',
    fr: 'Donnez une date entre hier et dans un an.',
    de: 'Geben Sie ein Datum zwischen gestern und in einem Jahr an.',
    es: 'Indique una fecha entre ayer y dentro de un año.',
  },
  errorAirport: {
    en: 'Airports are 3-letter codes (CDG, NCE), and two different ones.',
    fr: 'Les aéroports sont des codes de 3 lettres (CDG, NCE), et deux codes différents.',
    de: 'Flughäfen sind 3-Buchstaben-Codes (CDG, NCE), und zwei verschiedene.',
    es: 'Los aeropuertos son códigos de 3 letras (CDG, NCE), y dos distintos.',
  },
  errorNotOnRoute: {
    en: '{flight} of {date} does not fly {route}: it flies {actual}.',
    fr: '{flight} du {date} ne fait pas {route} : il fait {actual}.',
    de: '{flight} vom {date} fliegt nicht {route}: Er fliegt {actual}.',
    es: '{flight} del {date} no hace {route}: hace {actual}.',
  },
  errorStored: {
    en: 'Invalid flight.',
    fr: 'Vol invalide.',
    de: 'Ungültiger Flug.',
    es: 'Vuelo no válido.',
  },
  errorFlightMissing: {
    en: 'Type the flight: its number in the list or its flight number.',
    fr: 'Tapez le vol : son numéro dans la liste ou son numéro de vol.',
    de: 'Geben Sie den Flug ein: seine Nummer in der Liste oder seine Flugnummer.',
    es: 'Escriba el vuelo: su número en la lista o su número de vuelo.',
  },
  errorFlightUnknown: {
    en: 'No followed flight matches "{query}" (see "List the flights").',
    fr: 'Aucun vol suivi ne correspond à « {query} » (voir « Lister les vols »).',
    de: 'Kein verfolgter Flug passt zu „{query}“ (siehe „Flüge auflisten“).',
    es: 'Ningún vuelo en seguimiento coincide con «{query}» (vea «Listar los vuelos»).',
  },
  errorTooManyFlights: {
    en: 'At most {max} flights: stop following one first.',
    fr: '{max} vols au plus : arrêtez d’abord d’en suivre un.',
    de: 'Höchstens {max} Flüge: Beenden Sie zuerst die Verfolgung eines Flugs.',
    es: '{max} vuelos como máximo: deje primero de seguir uno.',
  },
  errorFlightExists: {
    en: 'This flight is already followed.',
    fr: 'Ce vol est déjà suivi.',
    de: 'Dieser Flug wird bereits verfolgt.',
    es: 'Este vuelo ya está en seguimiento.',
  },
  errorUnknownDevice: {
    en: 'This device is not a followed flight any more.',
    fr: 'Cet appareil n’est plus un vol suivi.',
    de: 'Dieses Gerät ist kein verfolgter Flug mehr.',
    es: 'Este dispositivo ya no es un vuelo en seguimiento.',
  },
  // widgets
  widgetNoFlight: {
    en: 'Choose a flight in the settings of the widget.',
    fr: 'Choisissez un vol dans les réglages du widget.',
    de: 'Wählen Sie einen Flug in den Einstellungen des Widgets.',
    es: 'Elija un vuelo en los ajustes del widget.',
  },
  widgetNotRead: {
    en: 'Not read yet: the flight is read at the next turn.',
    fr: 'Pas encore lu : le vol sera lu au prochain passage.',
    de: 'Noch nicht gelesen: Der Flug wird beim nächsten Durchlauf gelesen.',
    es: 'Aún no leído: el vuelo se leerá en la próxima pasada.',
  },
  widgetNoFlights: {
    en: 'No flight followed: press "Follow a flight" in the configuration of the integration.',
    fr: 'Aucun vol suivi : appuyez sur « Suivre un vol » dans la configuration de l’intégration.',
    de: 'Kein Flug verfolgt: Drücken Sie „Flug verfolgen“ in der Konfiguration der Integration.',
    es: 'Ningún vuelo en seguimiento: pulse «Seguir un vuelo» en la configuración de la integración.',
  },
  widgetStatus: { en: 'Status', fr: 'Statut', de: 'Status', es: 'Estado' },
  widgetDeparture: { en: 'Departure', fr: 'Départ', de: 'Abflug', es: 'Salida' },
  widgetArrival: { en: 'Arrival', fr: 'Arrivée', de: 'Ankunft', es: 'Llegada' },
  widgetGate: { en: 'Gate', fr: 'Porte', de: 'Gate', es: 'Puerta' },
  widgetBelt: { en: 'Baggage belt', fr: 'Tapis bagages', de: 'Gepäckband', es: 'Cinta' },
  widgetDelay: { en: 'Delay', fr: 'Retard', de: 'Verspätung', es: 'Retraso' },
  widgetAircraft: { en: 'Aircraft', fr: 'Avion', de: 'Flugzeug', es: 'Avión' },
  widgetScheduled: { en: 'Scheduled', fr: 'Prévu', de: 'Geplant', es: 'Previsto' },
  widgetTerminal: { en: 'Terminal', fr: 'Terminal', de: 'Terminal', es: 'Terminal' },
  widgetSource: {
    en: 'Air France-KLM data, read at {time}',
    fr: 'Données Air France-KLM, lues à {time}',
    de: 'Daten von Air France-KLM, gelesen um {time}',
    es: 'Datos de Air France-KLM, leídos a las {time}',
  },
  widgetBudget: {
    en: '{used}/{limit} calls today · Air France-KLM',
    fr: '{used}/{limit} requêtes aujourd’hui · Air France-KLM',
    de: '{used}/{limit} Abfragen heute · Air France-KLM',
    es: '{used}/{limit} consultas hoy · Air France-KLM',
  },
};

/**
 * @description Whether a value is one of the languages of the texts.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, with its placeholders filled.
 * @param {string} key - The key of TEXTS.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholders.
 * @returns {string} The text.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - The key of TEXTS.
 * @param {object|Function} [values] - The placeholders, or `(language) =>`
 * placeholders.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description A date: "Fri 6 Nov".
 * @param {string} date - `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @returns {string} The date.
 */
function dateText(date, language) {
  const locale = LOCALES[isLanguage(language) ? language : 'en'];
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * @description A day and month: "06/11".
 * @param {string} date - `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @returns {string} The date, in numbers.
 */
function numericDate(date, language) {
  const locale = LOCALES[isLanguage(language) ? language : 'en'];
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * @description The status of a snapshot.
 * @param {string} status - A key of flights.STATUSES.
 * @param {string} language - The language.
 * @returns {string} "Delayed".
 */
const statusText = (status, language) => t(`status_${status}`, language);

/**
 * @description A delay: "+35 min", "−5 min", "on time".
 * @param {number|null} minutes - The delay.
 * @param {string} language - The language.
 * @returns {string} The text, '' when unknown.
 */
function delayText(minutes, language) {
  if (minutes === null || minutes === undefined) {
    return '';
  }
  if (minutes === 0) {
    return t('onTime', language);
  }
  return t(minutes > 0 ? 'minutesLate' : 'minutesEarly', language, {
    minutes: Math.abs(minutes),
  });
}

/**
 * @description The route of a snapshot: "CDG → NCE" (cities when asked).
 * @param {object} snapshot - A snapshot (flights.js).
 * @param {object} [options] - `{ cities }`: "Paris → Nice".
 * @returns {string} The route, '' when unknown.
 */
function routeText(snapshot, { cities = false } = {}) {
  const from = (cities && snapshot?.departure?.city) || snapshot?.departure?.airport || '';
  const to = (cities && snapshot?.arrival?.city) || snapshot?.arrival?.airport || '';
  return from && to ? `${from} → ${to}` : '';
}

/**
 * @description The local time of a leg end, "+1" when it lands another day.
 * @param {string|null} value - ISO text of the API.
 * @param {string|null} [reference] - ISO text of the departure.
 * @returns {string} "16:10", "06:05 (+1)", '' when unknown.
 */
function clockText(value, reference) {
  const clock = airportClock(value);
  if (!clock) {
    return '';
  }
  const start = airportClock(reference);
  if (start && clock.date !== start.date) {
    const days = Math.round((Date.parse(clock.date) - Date.parse(start.date)) / 86400000);
    return `${clock.time} (${days > 0 ? '+' : ''}${days})`;
  }
  return clock.time;
}

/**
 * @description A terminal: "T2E", "T1" ("01" for "1"), "terminal B".
 * @param {string} terminal - The terminal code of the API.
 * @param {string} language - The language.
 * @returns {string} The text, '' when unknown.
 */
function terminalText(terminal, language) {
  const code = String(terminal ?? '')
    .trim()
    .replace(/^0+(?=\d)/, '');
  if (!code) {
    return '';
  }
  return t(/^\d/.test(code) ? 'terminal' : 'terminalLetter', language, { terminal: code });
}

/**
 * @description The departure of a snapshot: "14:35 (scheduled 14:05) · CDG T2F
 * · gate F42".
 * @param {object} snapshot - A snapshot.
 * @param {string} language - The language.
 * @returns {string} The text, '' when unknown.
 */
function departureText(snapshot, language) {
  const leg = snapshot?.departure;
  if (!leg) {
    return '';
  }
  const best = clockText(leg.best);
  const scheduled = clockText(leg.scheduled);
  const parts = [];
  if (best) {
    parts.push(
      scheduled && scheduled !== best
        ? `${best} (${t('scheduledAt', language, { time: scheduled })})`
        : best,
    );
  }
  const place = [leg.airport, terminalText(leg.terminal, language)].filter(Boolean).join(' ');
  if (place) {
    parts.push(place);
  }
  if (leg.gate) {
    parts.push(t('gate', language, { gate: leg.gate }));
  }
  return parts.join(' · ');
}

/**
 * @description The arrival of a snapshot: "16:10 · NCE T2 · belt 5".
 * @param {object} snapshot - A snapshot.
 * @param {string} language - The language.
 * @returns {string} The text, '' when unknown.
 */
function arrivalText(snapshot, language) {
  const leg = snapshot?.arrival;
  if (!leg) {
    return '';
  }
  const reference = snapshot.departure?.best ?? snapshot.departure?.scheduled;
  const best = clockText(leg.best, reference);
  // The day mark is on the best time only: "06:05 (+1) (scheduled 05:50)".
  const scheduled = clockText(leg.scheduled);
  const parts = [];
  if (best) {
    parts.push(
      scheduled && scheduled !== best
        ? `${best} (${t('scheduledAt', language, { time: scheduled })})`
        : best,
    );
  }
  const place = [leg.airport, terminalText(leg.terminal, language)].filter(Boolean).join(' ');
  if (place) {
    parts.push(place);
  }
  if (leg.belt) {
    parts.push(t('belt', language, { belt: leg.belt }));
  }
  return parts.join(' · ');
}

export {
  LANGUAGES,
  LOCALES,
  TEXTS,
  isLanguage,
  t,
  all,
  dateText,
  numericDate,
  statusText,
  delayText,
  routeText,
  clockText,
  terminalText,
  departureText,
  arrivalText,
};
