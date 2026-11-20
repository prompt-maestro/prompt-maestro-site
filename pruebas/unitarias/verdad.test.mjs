// @ts-check
// La pagina nunca promete algo que el producto no hace. Aqui se lee TODO lo que una persona ve en la pagina ya armada
// (plantilla, datos, el corto del inicio y demostracion) y se buscan las promesas prohibidas de la tabla de la verdad del PRD.
import assert from 'node:assert/strict';
import path from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { armarSitio } from '../../herramientas/armado.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Lo prohibido, como se diria en la pagina. Cada una con su porque. */
const PROHIBIDO = /** @type {[RegExp, string][]} */ ([
  [/al instante/, 'el agente no contesta "al instante": a veces espera a que la clienta termine de escribir'],
  // El dueno (19-nov-2026): a veces tarda a proposito, para juntar los mensajes seguidos de la clienta. No se promete.
  [/menos de un minuto/, 'ya no se promete contestar en menos de un minuto'],
  // Una nota de voz la contesta con otra nota de voz: la pagina no puede decir tambien que la contesta por escrito.
  [/(contesta|responde) por escrito/, 'a una nota de voz le contesta con voz, no por escrito'],
  // El dueno (19-nov-2026): "no hay descuentos, nosotros agendamos citas no definimos precios".
  [/\bdescuentos?\b/, 'no hay descuentos: el agente agenda citas, no define precios'],
  // El dueno (19-nov-2026): las devoluciones de dinero, en todos los casos y oficios, las gestiona el profesional.
  [
    /devolvemos|reembolsamos|agente (te |le )?(devuelve|reembolsa)/,
    'las devoluciones de dinero las gestiona el profesional directamente',
  ],
  [/\d+\s?segundos?/, 'no se promete un numero de segundos'],
  [/sin intervenci[oó]n humana/, 'la profesional siempre puede entrar'],
  // Ni siquiera en un ejemplo: la politica del salon de muestra (su retoque de garantia) se dice "sin costo".
  [/prueba(lo)? antes de pagar|prueba gratis|gratis/, 'no hay prueba antes de pagar ni nada gratis'],
  [/\d\s?%|por ciento/, 'ningun porcentaje de plantones o de mejora como hecho'],
  [/testimoni|nuestr[oa]s client[ea]s dicen|casos? de [eé]xito/, 'no hay testimonios de clientes que no existen'],
  // Se vale preguntarlo ("¿Me trae clientela nueva?") y negarlo; nunca afirmarlo.
  [/(?<!no te |¿me )trae client/, 'no trae clientela nueva: solo se puede decir en negativo'],
  // El agente contesta una nota de voz con otra (desde el 16-nov-2026). Lo que no hace es mandarle audios a la
  // profesional, ni llamar por telefono.
  [
    /te (manda|env[ií]a) (audios?|notas? de voz)|te llama por tel[eé]fono|llamadas? de voz/,
    'a ella no le manda audios ni la llama',
  ],
  [/expediente cl[ií]nico/, 'no es un expediente clinico'],
  [/\boxxo\b|\bspei\b/, 'a Prompt Maestro se le paga solo con tarjeta'],
  [/certificaci[oó]n|\bsoc ?2\b|\biso ?27/, 'ninguna norma de seguridad como certificacion'],
  [/lista en \d+ minutos|en \d+ minutos (queda|est[aá])/, 'no se prometen tiempos exactos de alta'],
  [/abogad|veterinari|psic[oó]log|barber|est[eé]tica|spa\b/, 'no se nombran oficios que todavia no existen'],
  [/tu cuenta personal/, 'el anticipo cae en "tu Mercado Pago", no en "tu cuenta personal"'],
  // El agente ya no ofrece hablar con la duena ni invita a escribir PERSONA: ningun texto se salta al agente.
  [/prefieres hablar con|escribe persona/, 'el agente no ofrece la salida PERSONA'],
  // Ni ofrece pasarle a la clienta con la profesional: lo que hace es tomar el recado y avisarle a ella.
  [
    /\bte l[ao]s? pasa\b|si tu (clienta|paciente) lo pide|te comunica con|te transfiere/,
    'el agente no ofrece pasarle a la clienta con la profesional',
  ],
  // El agente trabaja con la informacion que la profesional le da: no se entrena un modelo ni aprende por su cuenta.
  [
    /se entrena|entrenad[oa]s? con|entrenamos|entrenamiento|aprende sol[oa]|aprende (de|con) (tus|las) conversaciones|aprende por su cuenta/,
    'el agente no se entrena ni aprende solo: usa la base de conocimiento del negocio',
  ],
  [/—/, 'sin guiones largos'],
]);

let visible = '';
/** Lo mismo, con sus mayusculas: para lo que solo esta prohibido como palabra clave. */
let leido = '';
let html = '';

before(async () => {
  const { archivos } = await armarSitio({ raiz: RAIZ, destino: 'publica' });
  html = archivos.get('index.html')?.toString('utf8') ?? '';
  // Lo que se lee: el texto, mas lo que va en atributos que tambien se ensenan o se dicen (etiquetas, sugerencias y
  // los textos que el JavaScript pinta despues, que viajan en data-*).
  const atributos = [...html.matchAll(/\s(?:aria-label|placeholder|content|alt|data-[\w-]+)="([^"]*)"/g)].map(
    ([, valor]) => valor,
  );
  // Tambien lo que viaja como datos: la demostracion (JSON) y lo que leen los buscadores (datos estructurados).
  const datos = [...html.matchAll(/<script type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    ([, json]) => json,
  );
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  // Y la pagina contada para los modelos de lenguaje: tampoco ahi se promete de mas.
  const llms = archivos.get('llms.txt')?.toString('utf8') ?? '';
  leido = [texto, ...atributos, ...datos, llms].join(' ').replace(/\s+/g, ' ');
  visible = leido.toLowerCase();
});

test('la pagina armada trae sus secciones (si no, esta prueba no estaria leyendo nada)', () => {
  for (const frase of [
    'despreocúpate',
    'haz la cuenta',
    'lo que nos preguntan',
    'tu número, tu dinero',
    'pago aprobado',
  ]) {
    assert.ok(visible.includes(frase), frase);
  }
  assert.ok(visible.length > 8000);
});

for (const [patron, porque] of PROHIBIDO) {
  test(`nunca dice ${patron.source}: ${porque}`, () => {
    const hallado = patron.exec(visible);
    const donde = hallado ? visible.slice(Math.max(0, hallado.index - 60), hallado.index + 80) : '';
    assert.equal(hallado, null, `aparece en: ...${donde}...`);
  });
}

test('nunca dice PERSONA: la palabra clave con que se pedia hablar con alguien mas ya no existe', () => {
  // En minusculas "persona" es una palabra cualquiera ("si la persona asistio"); en mayusculas era la salida.
  assert.ok(leido.includes('Despreocúpate') && visible.includes('persona'), 'la prueba esta leyendo la pagina');
  const hallado = /PERSONA/.exec(leido);
  const donde = hallado ? leido.slice(Math.max(0, hallado.index - 60), hallado.index + 80) : '';
  assert.equal(hallado, null, `aparece en: ...${donde}...`);
});

test('lo que la pagina si tiene que decir, con las palabras de la tabla de la verdad', () => {
  for (const frase of [
    'tu mercado pago',
    'según la política que tú pones',
    'asistente virtual',
    'no te trae clientela nueva',
    'no diagnostica ni recomienda medicamentos',
    // "Tu agente": cada uno trabaja con la base de conocimiento de su negocio, contesta a cualquier hora (sin
    // prometer tiempos) y una nota de voz la contesta con otra; lo que hay que copiar va siempre por escrito.
    'hecho a la medida de tu negocio',
    'base de conocimiento',
    'contesta a cualquier hora',
    'le contesta con otra nota de voz',
    'siempre por escrito',
    'hoy, para uñas, dentistas y médicos',
    // Los mensajes son buenos: con el agente siguen llegando, y la comision de cada anticipo la fija Mercado Pago.
    'te siguen escribiendo, y tu agente contesta por ti',
    'la fija mercado pago, no nosotros',
    'médicos generales y especialistas',
    // "Como funciona", desde el primer mensaje hasta despues de la cita: el pago se verifica antes de agendar y ella
    // aprueba cada cambio. Y "Citas garantizadas" dice que todo pasa en WhatsApp.
    'desde el primer «hola»',
    'hasta el seguimiento después de la cita',
    'verifica el pago',
    'nada se aplica sin tu sí',
    'atiende por whatsapp',
  ]) {
    assert.ok(visible.includes(frase), frase);
  }
});

test('toda ancla de la pagina lleva a algo que existe', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id));
  const anclas = [...html.matchAll(/\shref="#([^"]+)"/g)].map(([, ancla]) => ancla);
  assert.ok(anclas.length >= 4);
  for (const ancla of anclas) assert.ok(ids.has(ancla ?? ''), `#${ancla} no existe`);
  // Y cada nombre se usa una sola vez.
  const repetidos = [...html.matchAll(/\sid="([^"]+)"/g)]
    .map(([, id]) => id)
    .filter((id, i, todos) => todos.indexOf(id) !== i);
  assert.deepEqual(repetidos, []);
});
