export enum Decade {
  Twenties = '1920s',
  Fifties = '1950s',
  Sixties = '1960s',
  Eighties = '1980s',
  Nineties = '1990s',
  Future = '2040s'
}

export type Persona = 'classic' | 'rebel' | 'star' | 'visionary';

export interface GeneratedImage {
  decade: Decade;
  url: string;
  loading: boolean;
  error?: string;
  promptUsed?: string;
}

export interface AppState {
  originalImage: string | null;
  secondImage: string | null;
  userName: string;
  selectedPersona: Persona;
  generations: Record<Decade, GeneratedImage>;
  isGenerating: boolean;
  apiKeySelected: boolean;
  tokenBalance: number | null;
  userEmail: string | null;
}

export interface EraConfig {
  id: Decade;
  label: string;
  description: string;
  prompts: string[];
}