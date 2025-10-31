import { describe, it, expect } from 'vitest';
import { FuzzyMatch } from '../src/FuzzyMatch.js';

describe('FuzzyMatch', () => {
  describe('clean()', () => {
    it('should remove numeric prefixes', () => {
      expect(FuzzyMatch.clean('001_main')).toBe('main');
      expect(FuzzyMatch.clean('010_tech')).toBe('tech');
      expect(FuzzyMatch.clean('040_output')).toBe('output');
    });

    it('should lowercase and remove separators', () => {
      expect(FuzzyMatch.clean('hello_world')).toBe('helloworld');
      expect(FuzzyMatch.clean('hello-world')).toBe('helloworld');
      expect(FuzzyMatch.clean('Hello World')).toBe('helloworld');
      expect(FuzzyMatch.clean('HELLO_WORLD')).toBe('helloworld');
    });

    it('should handle combined cases', () => {
      expect(FuzzyMatch.clean('001_Main_Section')).toBe('mainsection');
      expect(FuzzyMatch.clean('030_jobs-engineer')).toBe('jobsengineer');
    });
  });

  describe('score()', () => {
    it('should return 1.0 for exact matches', () => {
      expect(FuzzyMatch.score('hello', 'hello')).toBe(1.0);
      expect(FuzzyMatch.score('hello_world', 'helloworld')).toBe(1.0);
    });

    it('should score contains matches highly', () => {
      const score = FuzzyMatch.score('cozy_morning', 'cozy');
      expect(score).toBeGreaterThan(0.8);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should score sequential character matches', () => {
      const score = FuzzyMatch.score('professional', 'prf');
      expect(score).toBeGreaterThan(0.3);
      expect(score).toBeLessThan(0.8);
    });

    it('should score partial matches low', () => {
      const score = FuzzyMatch.score('hello', 'xyz');
      expect(score).toBeLessThan(0.3);
    });
  });

  describe('findBest()', () => {
    const files = [
      'agent.md',
      'professional.md',
      'cozy_morning.md',
      'office_professional.md'
    ];

    it('should find exact matches', () => {
      const result = FuzzyMatch.findBest(files, 'agent.md');
      expect(result).toBe('agent.md');
    });

    it('should find partial matches', () => {
      const result = FuzzyMatch.findBest(files, 'cozy');
      expect(result).toBe('cozy_morning.md');
    });

    it('should prefer better matches', () => {
      const result = FuzzyMatch.findBest(files, 'professional');
      expect(result).toBe('professional.md');
    });

    it('should return null for no matches', () => {
      const result = FuzzyMatch.findBest(files, 'xyz');
      expect(result).toBeNull();
    });

    it('should handle empty inputs', () => {
      expect(FuzzyMatch.findBest([], 'test')).toBeNull();
      expect(FuzzyMatch.findBest(files, '')).toBeNull();
      expect(FuzzyMatch.findBest(null, 'test')).toBeNull();
    });
  });

  describe('findBest() with objects', () => {
    const sections = [
      { name: '001_main', path: '/main' },
      { name: '040_output', path: '/output' },
      { name: '030_jobs', path: '/jobs' }
    ];

    it('should work with object extractor', () => {
      const result = FuzzyMatch.findBest(sections, 'main', s => s.name);
      expect(result.name).toBe('001_main');
    });

    it('should ignore numeric prefixes', () => {
      const result = FuzzyMatch.findBest(sections, 'jobs', s => s.name);
      expect(result.name).toBe('030_jobs');
    });
  });

  describe('findAll()', () => {
    const files = [
      'professional.md',
      'office_professional.md',
      'professional_attire.md',
      'agent.md'
    ];

    it('should find all matches above threshold', () => {
      const results = FuzzyMatch.findAll(files, 'professional');
      expect(results).toContain('professional.md');
      expect(results).toContain('office_professional.md');
      expect(results).toContain('professional_attire.md');
      expect(results).not.toContain('agent.md');
    });

    it('should sort by score', () => {
      const results = FuzzyMatch.findAll(files, 'professional');
      expect(results[0]).toBe('professional.md'); // Best match first
    });

    it('should respect custom threshold', () => {
      const results = FuzzyMatch.findAll(files, 'pro', 0.5);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('matches()', () => {
    it('should return true for matches', () => {
      expect(FuzzyMatch.matches('cozy_morning', 'cozy')).toBe(true);
      expect(FuzzyMatch.matches('professional', 'pro')).toBe(true);
    });

    it('should return false for non-matches', () => {
      expect(FuzzyMatch.matches('hello', 'xyz')).toBe(false);
    });
  });

  describe('Real-world file matching scenarios', () => {
    const manifestFiles = [
      'postgresql.md',
      'docker.md',
      'nodejs.md',
      'typescript.md',
      'react.md'
    ];

    it('should match technical files', () => {
      expect(FuzzyMatch.findBest(manifestFiles, 'docker')).toBe('docker.md');
      expect(FuzzyMatch.findBest(manifestFiles, 'postgres')).toBe('postgresql.md');
      expect(FuzzyMatch.findBest(manifestFiles, 'node')).toBe('nodejs.md');
    });

    it('should match framework files', () => {
      expect(FuzzyMatch.findBest(manifestFiles, 'react')).toBe('react.md');
      expect(FuzzyMatch.findBest(manifestFiles, 'typescript')).toBe('typescript.md');
    });
  });
});