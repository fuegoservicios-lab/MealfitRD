import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {crearVigiaDeSilencio,hayActividadDeAudio} from '../utils/cierreVozPorSilencio';
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>vi.useRealTimers());
it('closes at ten seconds, preserves the deadline through a listening-to-pause transition, and fires once',()=>{
    const close=vi.fn(),v=crearVigiaDeSilencio(close);
    v.esperar(); vi.advanceTimersByTime(8000); v.esperar();
    vi.advanceTimersByTime(1999); expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20000); expect(close).toHaveBeenCalledTimes(1);
});
it('a new word buys ten seconds; a backend response or ongoing speech is never cut',()=>{
    const close=vi.fn(),v=crearVigiaDeSilencio(close);
    v.esperar(); vi.advanceTimersByTime(9000); v.actividad();
    vi.advanceTimersByTime(9000); expect(close).not.toHaveBeenCalled();
    v.ocuparse(); vi.advanceTimersByTime(60000); expect(close).not.toHaveBeenCalled();
    v.esperar(); vi.advanceTimersByTime(9999); expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(close).toHaveBeenCalledTimes(1);
});
it('closing or unmounting cancels the old session timer',()=>{
    const close=vi.fn(),v=crearVigiaDeSilencio(close);
    v.esperar(); v.detener(); vi.advanceTimersByTime(20000);
    expect(close).not.toHaveBeenCalled();
});
it('both microphone levels and the actual incoming audio energy maintain the session; silence and video do not',()=>{
    const history=new Map(),stats=items=>new Map(items.map(x=>[x.id,x]));
    expect(hayActividadDeAudio(stats([{id:'mic',type:'media-source',kind:'audio',audioLevel:.1}]),history)).toBe(true);
    expect(hayActividadDeAudio(stats([{id:'remote',type:'inbound-rtp',kind:'audio',totalAudioEnergy:1,totalSamplesDuration:1}]),history)).toBe(false);
    expect(hayActividadDeAudio(stats([{id:'remote',type:'inbound-rtp',kind:'audio',totalAudioEnergy:1.01,totalSamplesDuration:2}]),history)).toBe(true);
    expect(hayActividadDeAudio(stats([{id:'remote',type:'inbound-rtp',kind:'audio',totalAudioEnergy:1.01,totalSamplesDuration:3},{id:'video',type:'media-source',kind:'video',audioLevel:1}]),history)).toBe(false);
});
