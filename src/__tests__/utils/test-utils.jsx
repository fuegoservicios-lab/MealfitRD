import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as assessmentModule from '../../context/AssessmentContext';
import { vi } from 'vitest';

vi.mock('../../supabase', () => ({
    supabase: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
    }
}));

export const mockAssessmentContext = {
    planCount: 0,
    userPlanLimit: 5,
    planData: {
        created_at: new Date().toISOString(),
        grocery_start_date: new Date().toISOString(),
        duration: 'weekly'
    },
    formData: {
        groceryDuration: 'weekly'
    },
    liveInventory: [],
    setLiveInventory: vi.fn(),
    setCurrentStep: vi.fn(),
    checkPlanLimit: vi.fn().mockResolvedValue({ reached: false }),
    isPremium: false,
    session: { user: { id: 'test-user' } }
};

// We will mock useAssessment in the individual test files or here.
// Since we want `customContext` to override the mock per render,
// we can spyOn `useAssessment` here.

const AllTheProviders = ({ children }) => {
    return (
        <MemoryRouter>
            {children}
        </MemoryRouter>
    );
};

const customRender = (ui, options = {}) => {
    const { customContext, ...renderOptions } = options;
    
    // Override useAssessment for this specific render
    vi.spyOn(assessmentModule, 'useAssessment').mockReturnValue({
        ...mockAssessmentContext,
        ...customContext
    });

    return render(ui, {
        wrapper: AllTheProviders,
        ...renderOptions
    });
};

export * from '@testing-library/react';
export { customRender as render };
