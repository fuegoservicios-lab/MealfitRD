// [P1-PLAN-LOTE-108] Escritor ZIP mínimo (deflate, sin zip64) para el paquete OTA.
//
// Por qué a mano: el VPS construye el paquete y no tiene `zip`; añadir una dependencia
// para ~60 líneas de formato estable desde 1993 es más superficie que el formato. El
// paquete pesa pocos MB y tiene cientos de ficheros: muy lejos de los límites de zip32.
// La ida y vuelta la comprueba `lote108.test.js` con un lector independiente.

import { deflateRawSync, crc32 } from 'node:zlib';

const FECHA_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1; // fija: mismo árbol ⇒ mismo zip

/** @param {{name: string, data: Buffer}[]} entradas — `name` con `/`, sin `./` ni `..`. */
export function crearZip(entradas) {
    const locales = [];
    const centrales = [];
    let offset = 0;
    for (const { name, data } of entradas) {
        if (!name || name.startsWith('/') || name.split('/').includes('..')) {
            throw new Error(`zip: nombre no permitido: ${name}`);
        }
        const nombre = Buffer.from(name, 'utf8');
        const comprimido = deflateRawSync(data, { level: 9 });
        const usarDeflate = comprimido.length < data.length;
        const cuerpo = usarDeflate ? comprimido : data;
        const crc = crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4); // versión necesaria
        local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
        local.writeUInt16LE(usarDeflate ? 8 : 0, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(FECHA_DOS, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(cuerpo.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nombre.length, 26);
        local.writeUInt16LE(0, 28);
        locales.push(local, nombre, cuerpo);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(usarDeflate ? 8 : 0, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(FECHA_DOS, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(cuerpo.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nombre.length, 28);
        central.writeUInt32LE(offset, 42);
        centrales.push(central, nombre);

        offset += 30 + nombre.length + cuerpo.length;
    }
    const dirCentral = Buffer.concat(centrales);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(entradas.length, 8);
    fin.writeUInt16LE(entradas.length, 10);
    fin.writeUInt32LE(dirCentral.length, 12);
    fin.writeUInt32LE(offset, 16);
    if (entradas.length > 0xfffe || offset + dirCentral.length > 0xfffffffe) {
        throw new Error('zip: el paquete excede zip32');
    }
    return Buffer.concat([...locales, dirCentral, fin]);
}
