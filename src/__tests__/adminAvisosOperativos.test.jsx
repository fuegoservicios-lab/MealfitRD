import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../pages/AdminAjustesResumen', () => ({ default: () => null }));
vi.mock('../pages/AdminCuentas', () => ({ default: () => <p>Cuentas de prueba</p> }));
import { fetchWithAuth } from '../config/api';
import AdminPage from '../pages/AdminPage';

const data = { generado:'2026-10-02T12:09:00Z', bloques:[{ id:'atencion', seccion:'Requiere atención',
    titulo:'Estado y avisos', tipo:'avisos', items:[
        { grupo:'activo',nivel:'aviso',titulo:'Catálogo pendiente',valor:'1',accion:'Revisar la procedencia.' },
        { grupo:'revision',nivel:'aviso',titulo:'Revisión técnica incompleta',valor:'1',momento:'Detectado: 27/09' },
        { grupo:'espera',nivel:'info',titulo:'Esperando autorización para usar IA',valor:'2' },
        { grupo:'historial',nivel:'info',titulo:'Primer plan beta',valor:'3' },
    ] }] };
const response = (body=data,status=200) => ({ ok:status<400,status,json:async()=>body });
const requests = () => fetchWithAuth.mock.calls.filter(([url])=>url.startsWith('/api/admin/metricas'));
const mount = async () => { let result; await act(async()=>{ result=render(<MemoryRouter><AdminPage /></MemoryRouter>); }); return result; };
let visibility;
beforeEach(()=>{
    vi.useFakeTimers();vi.clearAllMocks();sessionStorage.clear();localStorage.clear();
    visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
    fetchWithAuth.mockImplementation(async()=>response());
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});

describe('avisos operativos y refresco del administrador',()=>{
    it('separa activo, revisión y espera; el historial empieza plegado',async()=>{
        await mount();
        expect(screen.getByRole('region',{name:'Problemas activos (1)'})).toBeInTheDocument();
        expect(screen.getByRole('region',{name:'Pendientes de revisión (1)'})).toBeInTheDocument();
        expect(screen.getByRole('region',{name:'Esperando al usuario (2)'})).toBeInTheDocument();
        expect(screen.getByText('Revisar la procedencia.')).toBeInTheDocument();
        expect(screen.getByText('Detectado: 27/09')).toBeInTheDocument();
        expect(screen.getByText('Eventos anteriores (3)').closest('details')).not.toHaveAttribute('open');
    });
    it('cada 30 segundos actualiza sin desmontar contenido ni cerrar el historial ni mover scroll',async()=>{
        const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
        await mount();
        const container=document.querySelector('[data-contenido]');
        const details=screen.getByText('Eventos anteriores (3)').closest('details');
        details.open=true;
        await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
        expect(requests()).toHaveLength(2);
        expect(document.querySelector('[data-contenido]')).toBe(container);
        expect(details).toHaveAttribute('open');
        expect(scroll).not.toHaveBeenCalled();
    });
    it('suspende consultas cuando está oculto y consulta al volver',async()=>{
        await mount();visibility.mockReturnValue('hidden');
        await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
        expect(requests()).toHaveLength(1);
        visibility.mockReturnValue('visible');
        await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));});
        expect(requests()).toHaveLength(2);
    });
    it('no solapa consultas lentas y limpia el temporizador al salir',async()=>{
        let resolve;
        fetchWithAuth.mockImplementation((url)=>url.startsWith('/api/admin/metricas') ? new Promise(r=>{resolve=r;}) : Promise.resolve(response()));
        const view=await mount();
        await act(async()=>{await vi.advanceTimersByTimeAsync(90000);});
        expect(requests()).toHaveLength(1);
        await act(async()=>{resolve(response());});
        view.unmount();
        await act(async()=>{await vi.advanceTimersByTimeAsync(90000);});
        expect(requests()).toHaveLength(1);
        expect(requests()[0][1].signal.aborted).toBe(true);
    });
    it('un fallo conserva los datos y avisa que la actualización falló',async()=>{
        await mount();
        fetchWithAuth.mockResolvedValue(response(null,503));
        await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
        expect(screen.getByText('Catálogo pendiente')).toBeInTheDocument();
        expect(screen.getByText('No se pudo actualizar; sigues viendo los datos anteriores.')).toBeInTheDocument();
    });
    it('no consulta métricas periódicamente en Cuentas',async()=>{
        await mount();fireEvent.click(screen.getByRole('tab',{name:'Cuentas'}));
        await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
        expect(requests()).toHaveLength(1);
    });
});
