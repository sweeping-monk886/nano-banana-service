import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FEISHU_APP_ID ||= 'test';
process.env.FEISHU_APP_SECRET ||= 'test';
process.env.FEISHU_MAIN_APP_TOKEN ||= 'test';
process.env.FEISHU_MAIN_TABLE_ID ||= 'test';
process.env.FEISHU_LIB_APP_TOKEN ||= 'test';
process.env.FEISHU_LIB_TABLE_ID ||= 'test';
process.env.NANO_BASE_URL ||= 'https://example.invalid';
process.env.NANO_API_KEY ||= 'test';
process.env.OPENAI_BASE_URL ||= 'https://example.invalid/v1';
process.env.OPENAI_API_KEY ||= 'test';

const { buildPrompts } = await import('../src/prompts.js');
const { buildContinuationReferenceSet, buildInitialReferenceSet, selectReferenceTokens } = await import('../src/pipeline.js');

test('reference selection keeps only front face, one angle and one clothing image', () => {
  const result = selectReferenceTokens({
    modelTokens: ['front', 'angle', 'other-angle'],
    clothingTokens: ['clothing', 'other-clothing'],
  });
  assert.deepEqual(result, {
    modelTokens: ['front', 'angle'],
    clothingTokens: ['clothing'],
  });
});

test('initial images use one front face, one supporting face and one clothing image', () => {
  const result = buildInitialReferenceSet({
    modelUrls: ['model-front', 'model-angle'],
    modelLabels: ['model-1', 'model-2'],
    clothingUrls: ['clothing'],
    clothingLabels: ['clothing-label'],
  });
  assert.deepEqual(result.urls, ['model-front', 'model-angle', 'clothing']);
});

test('continuation images add only the previous generated image', () => {
  const result = buildContinuationReferenceSet({
    modelUrls: ['model-front', 'model-angle'],
    modelLabels: ['model-1', 'model-2'],
    clothingUrls: ['clothing'],
    clothingLabels: ['clothing-label'],
    previousUrl: 'generated-1',
  });
  assert.deepEqual(result.urls, ['model-front', 'model-angle', 'clothing', 'generated-1']);
  assert.match(result.labels.at(3), /PREVIOUSLY GENERATED/);
  assert.match(result.labels.at(3), /color-grade continuity/);
});

test('face guard is last and fixed body or makeup requirements are absent', () => {
  const promptLib = [{ fields: { '背景提示词': 'quiet studio', '动作提示词': 'walking pose' } }];
  const { prompt1, prompt2, prompt3 } = buildPrompts({
    promptLib,
    modelReferenceCount: 3,
    clothingReferenceCount: 1,
  });
  for (const prompt of [prompt1, prompt2, prompt3]) {
    assert.doesNotMatch(prompt, /47-48 kg|narrow shoulders|natural reddish lip/i);
    assert.match(prompt, /FINAL IDENTITY CHECK/);
    assert.match(prompt, /slight closed-mouth smile/);
    assert.match(prompt, /no exposed teeth, open mouth, squinting, raised brows/);
    assert.match(prompt, /head width, face geometry, eyes, brows, nose, lips, jawline and hairline remain fixed\.$/);
    assert.match(prompt, /NATURAL BODY SCALE LOCK/);
    assert.match(prompt, /one-eighth to one-eighth-and-a-half/);
    assert.match(prompt, /60-68% of the canvas height/);
    assert.match(prompt, /face must not be the visual subject/);
    assert.match(prompt, /COLOR AND EXPOSURE LOCK|authoritative color and exposure master/);
    assert.doesNotMatch(prompt, /Cool neutral expression, no smile/);
    assert.match(prompt, /Do not invent accessories absent from the complete outfit reference/);
    assert.match(prompt, /PRESERVE NAIL APPEARANCE/);
  }
  assert.doesNotMatch(prompt2, /Do not take its face, body proportions, body shape/i);
  assert.match(prompt2, /TAKE the exact outfit, footwear, visible accessories, body scale, body proportions/i);
  assert.match(prompt2, /first generated fashion image is the authoritative color and exposure master/i);
});

test('fixed regression prompts bypass random library selection', () => {
  const fixedPromptSet = {
    background: 'fixed glass storefront',
    poses: ['fixed pose one', 'fixed pose two', 'fixed pose three'],
  };
  const result = buildPrompts({
    promptLib: [{ fields: { '背景提示词2': 'random background', '动作提示词': 'random pose' } }],
    modelReferenceCount: 2,
    clothingReferenceCount: 1,
    fixedPromptSet,
  });
  assert.match(result.background, /BACKGROUND QUALITY TEMPLATE/);
  assert.match(result.background, /fixed glass storefront/);
  assert.deepEqual(result.poses, fixedPromptSet.poses);
  assert.match(result.prompt1, /fixed pose one/);
  assert.match(result.prompt2, /fixed pose two/);
  assert.match(result.prompt3, /fixed pose three/);
  assert.doesNotMatch(result.prompt1, /random background|random pose/);
});

test('background modes preserve defaults and apply indoor/outdoor filters', () => {
  const promptLib = [
    { fields: { 背景类型: '室内', 背景提示词2: 'curated indoor studio', 动作提示词: 'pose' } },
    { fields: { 背景类型: '室外', 背景提示词2: 'curated outdoor lane', 动作提示词: 'pose' } },
  ];
  const indoor = buildPrompts({ promptLib, backgroundMode: '室内' });
  assert.match(indoor.background, /curated indoor studio/);
  assert.doesNotMatch(indoor.background, /curated outdoor lane/);
  const outdoor = buildPrompts({ promptLib, backgroundMode: '室外' });
  assert.match(outdoor.background, /curated outdoor lane/);
  assert.doesNotMatch(outdoor.background, /curated indoor studio/);
  const automatic = buildPrompts({ promptLib });
  assert.match(automatic.background, /curated (indoor studio|outdoor lane)/);
});

test('final background modes use scene number and fixed white/beige records', () => {
  const promptLib = [
    { fields: { 标号: '34', 背景提示词2: 'numbered courtyard', 动作提示词: 'pose', 背景类型: '室外' } },
    { fields: { 标号: '77', 场景提示词: 'pure white backdrop', 背景类型: '白色' } },
    { fields: { 标号: '78', 场景提示词: 'light beige backdrop', 背景类型: '米色' } },
  ];
  const specified = buildPrompts({ promptLib, backgroundMode: '指定场景', backgroundNumber: '34' });
  assert.match(specified.background, /numbered courtyard/);
  const legacyNumbered = buildPrompts({ promptLib, backgroundMode: '指定背景', backgroundNumber: '34' });
  assert.match(legacyNumbered.background, /numbered courtyard/);
  const inlineNumbered = buildPrompts({ promptLib, backgroundMode: '指定背景:34' });
  assert.match(inlineNumbered.background, /numbered courtyard/);
  const selectableNumbered = buildPrompts({ promptLib, backgroundMode: '指定背景-34' });
  assert.match(selectableNumbered.background, /numbered courtyard/);
  const numericOnly = buildPrompts({ promptLib, backgroundMode: '34' });
  assert.match(numericOnly.background, /numbered courtyard/);
  assert.equal(buildPrompts({ promptLib, backgroundMode: '77' }).backgroundMode, '白色');
  assert.equal(buildPrompts({ promptLib, backgroundMode: '78' }).backgroundMode, '米色');
  const automaticAlias = buildPrompts({ promptLib, backgroundMode: '自动背景' });
  assert.doesNotMatch(automaticAlias.background, /pure white|light beige/);
  assert.match(buildPrompts({ promptLib, backgroundMode: '白色，' }).background, /pure white backdrop/);
  assert.match(buildPrompts({ promptLib, backgroundMode: '米色,' }).background, /light beige backdrop/);
  const white = buildPrompts({ promptLib, backgroundMode: '白色' });
  assert.match(white.background, /pure white backdrop/);
  const beige = buildPrompts({ promptLib, backgroundMode: '米色' });
  assert.match(beige.background, /light beige backdrop/);
  assert.match(buildPrompts({ promptLib, backgroundMode: '白色', backgroundNumber: '34' }).background, /pure white backdrop/);
  assert.throws(() => buildPrompts({ promptLib, backgroundMode: '指定场景' }), /必须填写场景编号/);
  const automatic = buildPrompts({ promptLib, backgroundMode: '自动场景' });
  assert.doesNotMatch(automatic.background, /pure white|light beige/);
});

test('automatic mode excludes rows 77/78 even when background type is blank', () => {
  const promptLib = [
    { fields: { 标号: '77', 背景提示词2: 'pure white backdrop' } },
    { fields: { 标号: '78', 背景提示词2: 'light beige backdrop' } },
    { fields: { 标号: '12', 背景提示词2: 'ordinary street scene' } },
  ];
  const automatic = buildPrompts({ promptLib, backgroundMode: '自动场景' });
  assert.match(automatic.background, /ordinary street scene/);
  assert.doesNotMatch(automatic.background, /pure white|light beige/);
  assert.match(buildPrompts({ promptLib, backgroundMode: '白色' }).background, /pure white backdrop/);
  assert.match(buildPrompts({ promptLib, backgroundMode: '米色' }).background, /light beige backdrop/);
});

test('local solid background numbers are configurable and excluded from random selection', () => {
  const promptLib = [
    { fields: { 标号: '152', 背景提示词2: 'local pure white', 动作提示词: 'forbidden white action' } },
    { fields: { 标号: '153', 背景提示词2: 'local light beige', 动作提示词: 'forbidden beige action' } },
    { fields: { 标号: '12', 背景提示词2: 'ordinary scene', 动作提示词: 'valid action' } },
  ];
  const options = {
    promptLib,
    whiteBackgroundNumber: '152',
    beigeBackgroundNumber: '153',
  };
  const automatic = buildPrompts({ ...options, backgroundMode: '自动场景' });
  assert.match(automatic.background, /ordinary scene/);
  assert.ok(automatic.poses.every(pose => !/forbidden/.test(pose)));
  const white = buildPrompts({ ...options, backgroundMode: '152' });
  assert.equal(white.backgroundMode, '白色');
  assert.match(white.background, /local pure white/);
  const beige = buildPrompts({ ...options, backgroundMode: '153' });
  assert.equal(beige.backgroundMode, '米色');
  assert.match(beige.background, /local light beige/);
});

test('solid modes fall back to background type when fixed row number is unavailable', () => {
  const promptLib = [
    { fields: { 背景类型: '白色', 背景提示词2: 'typed white backdrop' } },
    { fields: { 背景类型: '米色', 背景提示词2: 'typed beige backdrop' } },
  ];
  assert.match(buildPrompts({ promptLib, backgroundMode: '白色' }).background, /typed white backdrop/);
  assert.match(buildPrompts({ promptLib, backgroundMode: '米色' }).background, /typed beige backdrop/);
});

test('action selection excludes white/beige rows and empty action fields', () => {
  const promptLib = [
    { fields: { 标号: '77', 背景提示词2: 'white', 动作提示词: 'forbidden white action' } },
    { fields: { 标号: '78', 背景提示词2: 'beige', 动作提示词: [] } },
    { fields: { 标号: '12', 背景提示词2: 'scene', 动作提示词: 'valid action one' } },
    { fields: { 标号: '13', 背景提示词2: 'scene', 动作提示词: 'valid action two' } },
    { fields: { 标号: '14', 背景提示词2: 'scene', 动作提示词: 'valid action three' } },
  ];
  const result = buildPrompts({ promptLib, backgroundMode: '自动场景' });
  assert.equal(result.poses.filter(Boolean).length, 3);
  assert.ok(result.poses.every(pose => !/forbidden white action|beige/.test(pose)));
});

test('specified background requires text or a reference image and keeps quality template', () => {
  assert.throws(() => buildPrompts({ promptLib: [], backgroundMode: '指定背景' }), /至少填写/);
  const textOnly = buildPrompts({
    promptLib: [],
    backgroundMode: '指定背景',
    customBackgroundDescription: '中秋节现代中式庭院，月亮和灯笼',
  });
  assert.match(textOnly.background, /BACKGROUND QUALITY TEMPLATE/);
  assert.match(textOnly.background, /中秋节现代中式庭院/);
  const imageOnly = buildPrompts({ promptLib: [], backgroundMode: '指定背景', backgroundReferenceCount: 1 });
  assert.match(imageOnly.background, /labeled background reference image/);
});

test('no-background mode emits transparent rules and does not use random scene text', () => {
  const result = buildPrompts({
    promptLib: [{ fields: { 背景提示词2: 'random scene', 动作提示词: 'pose' } }],
    backgroundMode: '无背景',
  });
  assert.equal(result.transparentBackground, true);
  assert.match(result.background, /TRANSPARENT BACKGROUND MODE/);
  assert.doesNotMatch(result.background, /random scene/);
});

test('collects optional specified background reference attachments', async () => {
  const { collectFileTokens } = await import('../src/prompts.js');
  const result = collectFileTokens({ fields: {
    模特参考图: [{ file_token: 'model' }],
    衣服参考图: [{ file_token: 'outfit' }],
    指定背景参考图: [{ file_token: 'background' }],
  } });
  assert.deepEqual(result.backgroundTokens, ['background']);
});

