const MODEL_SPEC = [
  'Preserve the PERSON reference model\'s natural body build, shoulder width, skin tone, age and makeup.',
  'Do not impose a standardized fashion-model body, face shape, skin color or lipstick color.',
  'PRESERVE NAIL APPEARANCE: keep the visible nail length, shape, polish color, finish and decoration from the PERSON reference images. If the nails are not clearly visible in the person references, use short natural nails with no invented polish or nail art; never change nail color between generated images.',
].join(' ');

const LOGO_RULE = 'If any logos, brand marks, prints, embroidery, labels or text are visible on the garment, reproduce them with pixel-accurate shape, position, scale, color and exact text — do not invent, distort, blur, mirror, or omit them.';

const GARMENT_LOCK = [
  'COMPLETE OUTFIT LOCK: treat the complete outfit reference as one authoritative styled look. Preserve every visible garment, layer, shoe, hat, bag, belt, eyewear, jewelry and other accessory, including their exact pairing, placement, proportions, colors, materials and textures.',
  'Copy the clothing reference exactly, including every seam, hem, layer, print, texture, closure and proportion.',
  'Copy the exact shoes from the clothing reference: same shoe type, toe shape, color, sole, straps and height. Footwear is non-negotiable; never replace it with heels, pointed toes, flats, sneakers or another shoe style.',
  'Do not remove, replace, rearrange or invent visible accessories. Preserve accessories present in the complete outfit reference, and do not add accessories absent from it.',
].join(' ');

const BODY_SCALE_LOCK = [
  'NATURAL BODY SCALE LOCK: show the complete body including the shoes, with clear natural space above the head and below the soles; never crop the head or feet.',
  'Keep natural adult proportions: the head must be approximately one-eighth to one-eighth-and-a-half of standing height, never larger. Do not enlarge the head, shorten the neck, shorten the torso or shorten the legs to make the face more visible.',
  'Keep the complete person approximately 60-68% of the canvas height with generous space above the head and below the shoes; keep this same smaller scale across the image set.',
  'Use a distant natural full-body fashion photography perspective with the camera level at waist to lower-chest height and the sensor parallel to the body. The face must not be the visual subject and must not occupy a close-up portion of the frame. No close camera, portrait crop, wide-angle stretching, strong telephoto compression, high angle, low angle or doll-like head-to-body ratio.',
].join(' ');

const COLOR_LOCK = [
  'COLOR AND EXPOSURE LOCK: use a consistent neutral daylight grade across the image set.',
  'Keep white balance, exposure, skin-tone luminance, garment hue, contrast, saturation, black point and shadow direction consistent.',
  'Do not apply auto exposure, automatic relighting, warming, cooling, magenta shift or a new tonal interpretation between images.',
].join(' ');

const CONTINUATION_COLOR_LOCK = [
  'The first generated fashion image is the authoritative color and exposure master for all continuation images.',
  'Copy its white balance, exposure, skin-tone luminance, garment hue, contrast, saturation, black point and shadow direction exactly while changing only the requested pose and framing.',
  'Do not auto-relight, warm, cool, add a magenta shift or reinterpret the tonal grade.',
].join(' ');

const FACE_LOCK = [
  'IDENTITY LOCK: the PRIMARY FRONT FACE image is the sole authority for identity.',
  'Copy its facial geometry exactly: head and jaw width, cheek fullness, chin, eye shape and spacing, brows, nose, lips and hairline.',
  'Supporting identity views clarify the same person only; never average them into a new face or change the primary front-view proportions.',
  'Even in a distant full-body composition, preserve the primary face width-to-height ratio, cheek fullness, jaw width and distinctive asymmetry; never replace the close-up identity with a generic fashion-model face.',
  'The identity reference controls facial geometry only. Ignore its close-up crop and apparent head size; never enlarge the generated head or face to make identity clearer.',
  'The face reference is for identity geometry only, never for scale or framing. Keep the face small and subordinate to the full outfit and complete-body composition.',
  'Do not beautify, slim, widen, round, age, de-age or change ethnicity.',
  'Do not retouch the face into a generic fashion-model face; preserve its natural asymmetry and distinctive proportions.',
].join(' ');

const FINAL_FACE_GUARD = [
  'FINAL IDENTITY CHECK — this rule overrides every pose, scene, clothing and previously generated reference:',
  'the face must match the PRIMARY FRONT FACE identity anchor, not merely resemble it.',
  'keep the head upright and close to frontal, with no more than a slight natural turn; no profile view, large turn, head tilt, looking down or looking up.',
  'Both eyes must be open, unobstructed and clearly visible. Expression may be neutral or a slight closed-mouth smile only: lips stay closed, mouth corners lift only slightly, with no exposed teeth, open mouth, squinting, raised brows, cheek lift or exaggerated expression, even if the pose description requests a bigger smile.',
  'HARD NEGATIVE EXPRESSION LOCK: zero teeth, zero open mouth, zero broad smile, zero laughing expression; the lips must remain sealed and only the corners may move by a minimal amount.',
  'Do not let any accessory obscure the identity anchor. Preserve a visible hat, glasses or sunglasses only when it is present in the complete outfit reference and the eyes and facial identity remain naturally readable; never invent facial occlusion.',
  'Do not copy any head, hair, face, expression, eyewear, jewelry, handbag or accessory from a CLOTHING reference.',
  'Do not invent accessories absent from the complete outfit reference. Preserve every accessory visibly present in that reference, including bags, hats, belts, eyewear and jewelry.',
  'Only the body pose, arms, hands, camera framing and a minimal closed-mouth smile may change; head width, face geometry, eyes, brows, nose, lips, jawline and hairline remain fixed.',
].join(' ');

const BASE1 = [
  'A highly realistic fashion editorial portrait.',
  MODEL_SPEC,
  'TAKE identity only from the PERSON reference group identified below. These images are the same person; use them jointly to preserve one identity. Do NOT take the face from any clothing reference image.',
  FACE_LOCK,
  'TAKE garments, footwear and visible accessories only from the CLOTHING reference group identified below — every garment detail, fabric, color, pattern, length, fit, silhouette and accessory relationship. Do NOT copy the clothing model body, skin tone, hands, head, hair or face. Treat clothing references as outfit templates only. Do not use their background, scene, props or lighting; the only scene source is the background description in the text prompt below.',
  'Preserve the exact length, silhouette, fit, material, pattern, color, and all visible details of every garment and footwear. Do not alter hem length, sleeve length, fabric type, or garment proportions.',
  LOGO_RULE,
  GARMENT_LOCK,
  BODY_SCALE_LOCK,
  COLOR_LOCK,
  'Neutral expression or a slight closed-mouth smile only.',
  'Natural skin texture with visible pores. Wearing the exact shoes and complete visible accessory set from the outfit reference.',
].join(' ');

const BASE2 = [
  'A new fashion editorial portrait, in a NEW pose that is different from the LAST reference image.',
  MODEL_SPEC,
  'TAKE identity only from the PERSON reference group identified below. These images are the same person; use them jointly to preserve one identity. The LAST image is a generated fashion image and its face is not an identity source.',
  FACE_LOCK,
  'TAKE the exact outfit, footwear, visible accessories, body scale, body proportions, lighting, color palette and composition from the LAST generated fashion image, while using the original CLOTHING reference group to verify garment and accessory details. Do not take its face, skin tone, hair or expression. The PERSON identity references remain authoritative for the person. The background and scene must follow the text background description below.',
  LOGO_RULE,
  GARMENT_LOCK,
  BODY_SCALE_LOCK,
  CONTINUATION_COLOR_LOCK,
  'CHANGE: only the pose, body posture, and camera framing change — they should follow the pose description below, not the pose in the LAST reference image.',
  'Neutral expression or a slight closed-mouth smile only.',
  'Natural skin texture with visible pores. Wearing the exact shoes and complete visible accessory set from the outfit reference.',
].join(' ');

const BACKGROUND_QUALITY_TEMPLATE = [
  'BACKGROUND QUALITY TEMPLATE: create a realistic fashion-editorial environment with coherent spatial depth, natural directional light, physically plausible shadows, refined material detail, balanced foreground and background separation, authentic photographic texture, clean composition and consistent exposure.',
  'The background supports the complete outfit and never competes with or obscures the model, shoes or accessories.',
].join(' ');

const TRANSPARENT_BACKGROUND_TEMPLATE = [
  'TRANSPARENT BACKGROUND MODE: generate a clean isolated full-body subject on a genuinely transparent background.',
  'No wall, floor, studio, scenery, props, cast shadow, contact shadow, gradient, halo or colored backdrop. Preserve the complete outfit and every visible accessory from the reference.',
].join(' ');

const QUALITY = 'shot on 85mm lens, shallow depth of field, natural daylight, ultra-detailed, 8K, sharp focus';

function flattenRichText(v) {
  if (!v) return '';
  if (Array.isArray(v)) return v.map(t => t.text || '').join('');
  return String(v);
}

function fieldText(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(' ').trim();
  if (typeof v === 'object') return String(v.name || v.text || v.value || '').trim();
  return String(v).trim();
}

function buildReferenceRules(modelReferenceCount, clothingReferenceCount) {
  const personGroup = modelReferenceCount > 1
    ? `${modelReferenceCount} labeled PERSON IDENTITY images show the same individual. PRIMARY FRONT FACE is authoritative; the single SUPPORTING VIEW only clarifies that identity.`
    : 'The labeled PRIMARY FRONT FACE image is the authoritative identity source.';
  const clothingGroup = `${clothingReferenceCount} labeled CLOTHING REFERENCE image(s) provide garments and footwear only.`;
  return {
    prompt1: `${personGroup} ${clothingGroup}`,
    prompt2: `${personGroup} ${clothingGroup} The labeled PREVIOUSLY GENERATED FASHION IMAGE provides outfit, body-scale, camera and color-grade continuity only; its face is never an identity source.`,
  };
}

function pickPromptLib(
  items,
  backgroundMode = '自动场景',
  backgroundNumber = '',
  whiteBackgroundNumber = '77',
  beigeBackgroundNumber = '78',
) {
  const shuffled = [...items].sort(() => 0.5 - Math.random());
  let background = '';
  const poses = ['', '', ''];
  const isSolid = backgroundMode === '白色' || backgroundMode === '米色';
  const solidNumber = backgroundMode === '白色' ? whiteBackgroundNumber : beigeBackgroundNumber;
  const rowNumber = item => fieldText(
    item.fields?.['标号']
      ?? item.fields?.['编号']
      ?? item.fields?.['序号']
      ?? item.fields?.['ID'],
  );
  const isSolidRow = item => {
    const type = fieldText(item.fields?.['背景类型']);
    const number = rowNumber(item);
    return type === '白色' || type === '米色'
      || number === whiteBackgroundNumber || number === beigeBackgroundNumber;
  };
  const eligible = backgroundMode === '室内' || backgroundMode === '室外'
    ? shuffled.filter(i => fieldText(i.fields?.['背景类型']) === backgroundMode)
    : isSolid
      ? shuffled.filter(i => (
        fieldText(i.fields?.['背景类型']) === backgroundMode || rowNumber(i) === solidNumber
      ))
      : backgroundMode === '自动场景'
        ? shuffled.filter(i => !isSolidRow(i))
        : shuffled;
  // Solid backgrounds normally use the fixed 77/78 rows. If those rows are
  // absent, keep compatibility with libraries that identify them by type.
  const explicitNumber = fieldText(backgroundNumber);
  const numbered = isSolid
    ? (eligible.some(i => rowNumber(i) === solidNumber) ? solidNumber : '')
    : explicitNumber;
  const numberedEligible = numbered
    ? eligible.filter(i => {
      return rowNumber(i) === numbered;
    })
    : eligible;
  if (numbered && numberedEligible.length === 0 && (backgroundMode === '指定场景' || isSolid)) {
    throw new Error(`找不到背景编号：${numbered}`);
  }
  const source = numbered ? numberedEligible : eligible;
  const bg = source.find(i => i.fields?.['背景提示词2'] || i.fields?.['背景提示词'] || i.fields?.['场景提示词']);
  if (bg) background = flattenRichText(bg.fields['背景提示词2'] || bg.fields['背景提示词'] || bg.fields['场景提示词']);
  if ((backgroundMode === '室内' || backgroundMode === '室外' || isSolid || backgroundMode === '指定场景') && !background) {
    throw new Error(`背景词库缺少${backgroundMode}背景提示词，请检查编号、背景类型和背景提示词字段`);
  }
  // White/beige rows are scene-only records and must never supply actions.
  shuffled
    .filter(i => !isSolidRow(i) && flattenRichText(i.fields?.['动作提示词']).trim())
    .slice(0, 3)
    .forEach((r, i) => {
      poses[i] = flattenRichText(r.fields['动作提示词']).trim();
    });
  return { background, poses };
}

export function buildPrompts({
  promptLib,
  modelReferenceCount = 1,
  clothingReferenceCount = 1,
  backgroundReferenceCount = 0,
  backgroundMode = '自动场景',
  backgroundNumber = '',
  solidColor = '白色',
  customBackgroundDescription = '',
  whiteBackgroundNumber = '77',
  beigeBackgroundNumber = '78',
  fixedPromptSet = null,
}) {
  const enteredMode = fieldText(backgroundMode).replace(/[，,。；;]+$/g, '').trim();
  const rawMode = !enteredMode || enteredMode === '自动背景' ? '自动场景' : enteredMode;
  const custom = fieldText(customBackgroundDescription);
  const explicitNumber = fieldText(backgroundNumber);
  const inlineNumberMatch = rawMode.match(/^(?:指定场景|指定背景)\s*[:：#-]?\s*(\d+)$/);
  const inlineNumber = /^\d+$/.test(rawMode) ? rawMode : inlineNumberMatch?.[1] || '';
  const resolvedNumber = explicitNumber || inlineNumber;
  const modeFromSingleField = inlineNumber ? '指定场景' : rawMode;
  // Older tables call the numbered mode "指定背景". When a scene number is
  // present, interpret that value as the final "指定场景" mode; keep the
  // legacy text/image behavior when no number is supplied.
  const mode = resolvedNumber === whiteBackgroundNumber
    ? '白色'
    : resolvedNumber === beigeBackgroundNumber
      ? '米色'
      : modeFromSingleField === '指定背景' && resolvedNumber
    ? '指定场景'
    : modeFromSingleField;
  if (!['自动场景', '指定场景', '白色', '米色', '室内', '室外', '指定背景', '无背景', '纯色底'].includes(mode)) {
    throw new Error(`不支持的背景模式：${mode}`);
  }
  if (mode === '指定场景' && !resolvedNumber) {
    throw new Error('指定场景模式下必须填写场景编号');
  }
  if (mode === '指定背景' && !custom && backgroundReferenceCount === 0) {
    throw new Error('指定背景模式下，至少填写“指定背景描述”或上传“指定背景参考图”');
  }
  const picked = fixedPromptSet || (mode === '指定背景' || mode === '无背景' || mode === '纯色底'
    ? {
      background: '',
      poses: pickPromptLib(
        promptLib,
        '自动场景',
        '',
        whiteBackgroundNumber,
        beigeBackgroundNumber,
      ).poses,
    }
    : pickPromptLib(
      promptLib,
      mode,
      resolvedNumber,
      whiteBackgroundNumber,
      beigeBackgroundNumber,
    ));
  const background = mode === '指定背景'
    ? [BACKGROUND_QUALITY_TEMPLATE, custom ? `USER-SPECIFIED BACKGROUND: ${custom}` : 'Use the labeled background reference image for the requested scene.'].join(' ')
    : mode === '无背景'
      ? TRANSPARENT_BACKGROUND_TEMPLATE
      : mode === '纯色底'
        ? `${BACKGROUND_QUALITY_TEMPLATE} SOLID COLOR BACKGROUND MODE: use a perfectly even ${['白色', '米色'].includes(fieldText(solidColor)) ? fieldText(solidColor) : '白色'} background only. No visible wall, floor, scenery, props or patterned texture; keep the complete outfit and accessories unobstructed.`
      : [BACKGROUND_QUALITY_TEMPLATE, picked.background].filter(Boolean).join(' ');
  const poses = picked.poses;
  const referenceRules = buildReferenceRules(modelReferenceCount, clothingReferenceCount);
  const modeRule = mode === '室内'
    ? 'INDOOR SCENE LOCK: the scene must be indoors; do not show an outdoor street, sky or open exterior.'
    : mode === '室外'
      ? 'OUTDOOR SCENE LOCK: the scene must be outdoors; do not show an interior studio or room.'
    : mode === '无背景' || mode === '纯色底' ? '' : '';
  const backgroundRule = [background, modeRule].filter(Boolean).join(' ');
  return {
    background: backgroundRule,
    poses,
    backgroundMode: mode,
    transparentBackground: mode === '无背景',
    prompt1: `${BASE1}, ${referenceRules.prompt1}, ${poses[0]}, ${backgroundRule}, ${QUALITY}, ${FINAL_FACE_GUARD}`,
    prompt2: `${BASE2}, ${referenceRules.prompt2}, ${poses[1]}, ${backgroundRule}, ${QUALITY}, ${FINAL_FACE_GUARD}`,
    prompt3: `${BASE2}, ${referenceRules.prompt2}, ${poses[2]}, ${backgroundRule}, ${QUALITY}, ${FINAL_FACE_GUARD}`,
  };
}

export function collectFileTokens(record) {
  const clothingAtts = record.fields?.['衣服参考图'] || [];
  const modelAtts = record.fields?.['模特参考图'] || [];
  const backgroundAtts = record.fields?.['指定背景参考图'] || [];
  const clothingTokens = clothingAtts.map(f => f.file_token).filter(Boolean);
  const modelTokens = modelAtts.map(f => f.file_token).filter(Boolean);
  const backgroundTokens = backgroundAtts.map(f => f.file_token).filter(Boolean);
  if (modelTokens.length === 0) throw new Error('缺少"模特参考图"');
  if (modelTokens.length > 8) throw new Error('"模特参考图"最多上传8张');
  if (clothingTokens.length === 0) throw new Error('缺少"衣服参考图"');
  return { modelTokens, clothingTokens, backgroundTokens };
}

export { fieldText };
