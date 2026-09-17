export const apiKeyName = 'cursor-mercury-link.inceptionApiKey';
export const apiKeyDashboard = 'https://platform.inceptionlabs.ai/dashboard/api-keys';

// Settings > Models > API keys card, built from the same components as
// Cursor's own provider cards. The key lives in Cursor's secret storage.
export function settingsCardSrc(s) {
  return `
function __MercuryApiKeyCard(props){
const secrets=${s.useService}(${s.secretStorage}),opener=${s.settingsService}(props.settingsWorkspace,${s.openerId});
const [key,setKey]=${s.useState}("");
${s.useEffect}(()=>{let live=!0;Promise.resolve(secrets.get(__mercuryApiKeyName)).then(value=>{if(live)setKey(value??"")},()=>{});return()=>{live=!1}},[secrets]);
const commit=value=>{const next=String(value??"").trim();setKey(next);Promise.resolve(next?secrets.set(__mercuryApiKeyName,next):secrets.delete(__mercuryApiKeyName)).catch(()=>{})};
const description=${s.jsxs}(${s.descriptionWrapper},{children:["You can put in"," ",${s.keyJsx}(${s.link},{onClick:()=>{opener.open(${JSON.stringify(apiKeyDashboard)})},children:"your Inception key"})," ","to use Mercury models. Mercury reads text only, so images and PDFs are left out of its requests."]});
return ${s.keyJsx}(${s.card},{title:"Inception API Key",description,children:${s.keyJsx}(${s.zs}.Root,{accessibleLabel:"Inception API Key",children:${s.keyJsx}(${s.zs}.Entry,{label:"API Key",layout:"row",children:${s.keyJsx}(${s.keyInput},{ariaLabel:"Inception API key",onCommit:commit,persistedValue:key,placeholder:"Enter API key",type:"password"})})})});
}
`;
}

// Place the card directly below Cursor's Google card.
export function patchSettingsCard(source, once, s) {
  if (source.includes('function __MercuryApiKeyCard(')) throw new Error('Inception API key card already present');
  const fnAnchor = 'function ' + s.googleCard + '(';
  source = once(source, fnAnchor, settingsCardSrc(s) + fnAnchor);
  const [assigned, call] = [s.googleCardComposition.slice(0, s.googleCardComposition.indexOf('=') + 1), s.googleCardComposition.slice(s.googleCardComposition.indexOf('=') + 1)];
  const workspace = call.match(/\{settingsWorkspace:([\w$]+)\}\)$/)[1];
  return once(source, s.googleCardComposition,
    assigned + '[' + call.slice(0, -1) + ',"google-api-key"),' + s.keyJsx + '(__MercuryApiKeyCard,{settingsWorkspace:' + workspace + '},"inception-api-key")]');
}
