import { describe, expect, it } from 'vitest';
import { buildMenuEmbed, menuDefinition } from '../src/app/menu.js';

describe('Bot menu', () => {
  it('registers a menu slash command', () => {
    expect(menuDefinition.toJSON()).toMatchObject({
      name: 'menu',
      description: 'Xem menu hướng dẫn các lệnh của bot',
    });
  });

  it('lists main command groups and is suitable for a private reply', () => {
    const menu = buildMenuEmbed().toJSON();
    const text = [menu.title, menu.description, ...(menu.fields ?? []).flatMap((field) => [field.name, field.value])]
      .join('\n');

    expect(text).toContain('/tudien');
    expect(text).toContain('/khaobai');
    expect(text).toContain('/tuvi');
    expect(text).toContain('/leonui');
    expect(text).toContain('/xpkenh');
    expect(text).toContain('/xpadmin');
    expect(menu.description).toContain('chỉ hiển thị với bạn');
  });
});
