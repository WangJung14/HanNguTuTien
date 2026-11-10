import { describe, expect, it } from 'vitest';
import { commandDefinitions } from '../src/app/command-registry.js';
import { buildMenuEmbed, menuDefinition } from '../src/app/menu.js';

describe('Bot menu', () => {
  it('registers a menu slash command', () => {
    expect(menuDefinition.toJSON()).toMatchObject({
      name: 'menu',
      description: 'Xem menu hướng dẫn các lệnh của bot',
    });
  });

  it('lists every registered slash command in a private-friendly embed', () => {
    const menu = buildMenuEmbed().toJSON();
    const text = [menu.title, menu.description, ...(menu.fields ?? []).flatMap((field) => [field.name, field.value])].join('\n');
    for (const command of commandDefinitions) expect(text, `missing /${command.name}`).toContain(`/${command.name}`);
    expect(menu.description).toContain('chỉ hiển thị với bạn');
  });
});
