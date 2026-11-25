import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AgentBench Lab',
    short_name: 'AgentBench',
    description: 'Local-first inspection and testing for AI Agent and Skill packages.',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#020617'
  };
}
