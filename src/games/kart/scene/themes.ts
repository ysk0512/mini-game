import type { Theme } from '../logic/courses';

export interface ThemeColors {
  skyTop: string;
  skyBottom: string;
  fog: string;
  ground: string;
  asphalt: string;
  roadside: string;
  wallA: string;
  wallB: string;
  sun: string;
}

export const THEMES: Record<Theme, ThemeColors> = {
  sunset: {
    skyTop: '#3b82f6',
    skyBottom: '#fdba74',
    fog: '#f9c78f',
    ground: '#4d9a3c',
    asphalt: '#4b4b55',
    roadside: '#6abf4b',
    wallA: '#ef4444',
    wallB: '#f8fafc',
    sun: '#fff1d6',
  },
  canyon: {
    skyTop: '#0ea5e9',
    skyBottom: '#fde68a',
    fog: '#f2c98b',
    ground: '#c2773b',
    asphalt: '#5b524b',
    roadside: '#d9a066',
    wallA: '#9a5a2f',
    wallB: '#b86f3d',
    sun: '#fff7e6',
  },
};
