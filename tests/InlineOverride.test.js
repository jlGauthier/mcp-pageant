import { describe, it, expect } from 'vitest';
import { PersonaManager } from '../src/PersonaManager.js';

describe('parseInlineOverride', () => {
  const manager = new PersonaManager('/d/claudeTools/mcp_pageant', { testMode: true });

  it('should parse basic inline override without expiration', () => {
    const line = '040.01 - output/dialect/friendly: Warm conversational tone';
    const result = manager.parseInlineOverride(line);

    expect(result).toEqual({
      slotKey: '040.01',
      virtualPath: 'output/dialect/friendly',
      content: 'Warm conversational tone',
      expiresAt: null
    });
  });

  it('should parse inline override with expiration', () => {
    const futureTime = Date.now() + 100000;
    const line = `020.5 - pattern/temp_rule [expires:${futureTime}]: Always verify edge cases`;
    const result = manager.parseInlineOverride(line);

    expect(result).toEqual({
      slotKey: '020.5',
      virtualPath: 'pattern/temp_rule',
      content: 'Always verify edge cases',
      expiresAt: futureTime
    });
  });

  it('should parse inline override with .override suffix', () => {
    const futureTime = Date.now() + 100000;
    const line = `070.4.override - config/setting/test [expires:${futureTime}]: test configuration value`;
    const result = manager.parseInlineOverride(line);

    expect(result).toEqual({
      slotKey: '070.4.override',
      virtualPath: 'config/setting/test',
      content: 'test configuration value',
      expiresAt: futureTime
    });
  });

  it('should detect expired inline override', () => {
    const pastTime = Date.now() - 100000;
    const line = `020.5.override - pattern/temp_rule [expires:${pastTime}]: Old rule`;
    const result = manager.parseInlineOverride(line);

    expect(result).toEqual({
      expired: true,
      slotKey: '020.5.override'
    });
  });

  it('should detect expired inline override with .override suffix', () => {
    const pastTime = 1762011988964; // Actual expired timestamp from the bug
    const line = `070.4.override - config/setting/inline_1762011388964 [expires:${pastTime}]: test configuration value`;
    const result = manager.parseInlineOverride(line);

    expect(result).toEqual({
      expired: true,
      slotKey: '070.4.override'
    });
  });

  it('should return null for non-matching lines', () => {
    expect(manager.parseInlineOverride('@./manifest/file.md')).toBeNull();
    expect(manager.parseInlineOverride('# Comment')).toBeNull();
    expect(manager.parseInlineOverride('invalid format')).toBeNull();
  });
});
