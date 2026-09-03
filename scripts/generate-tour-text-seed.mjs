import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile('tour.xml', 'utf8');
const actions = [...source.matchAll(/<action\s+name="(show_(?:sister_city_info|miguel_legazpi_panel|sawangan_panel|spanish_era_panel|albay_viejo_panel|the_becerra_law_panel|two_churches_panel|perils_panel|the_battle_panel|economic_trans_panel|transport_panel|japanese_panel|regime_panel|republic_panel|progress_panel))"[\s\S]*?<\/action>/g)];

function quotedArguments(block, functionName) {
  const start = block.indexOf(`${functionName}(`);
  const values = [];
  let quote = false;
  let escaped = false;
  let value = '';
  for (let index = start; index < block.length; index += 1) {
    const character = block[index];
    if (!quote) {
      if (character === '"') {
        quote = true;
        value = '';
      }
      continue;
    }
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '"') {
      values.push(value);
      quote = false;
    } else {
      value += character;
    }
  }
  return values;
}

const statements = actions.map(([fullMatch, actionName]) => {
  const block = fullMatch;
  const functionName = block.includes('showTextModal(') ? 'showTextModal' : 'showInfoPanel';
  const values = quotedArguments(block, functionName);
  const textIndex = functionName === 'showTextModal' ? 1 : 2;
  if (values.length <= textIndex) throw new Error(`Could not extract paragraph for ${actionName}`);
  const text = values[textIndex].replaceAll("'", "''");
  return `update public.tour_texts set text = '${text}' where action_name = '${actionName}';`;
});

if (statements.length !== 15) throw new Error(`Expected 15 actions, found ${statements.length}`);
await writeFile('supabase/migrations/20260903030000_seed_tour_text_paragraphs.sql', `-- Seed visitor paragraphs extracted from tour.xml.\n-- Run after 20260903020000_tour_text_titles.sql.\n\n${statements.join('\n')}\n`);
console.log(`Generated ${statements.length} tour text paragraph updates.`);
