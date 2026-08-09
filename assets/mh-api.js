/* ============================================================
   mh-api.js — Accès Supabase par fonctions RPC sécurisées.
   Aucune table n'est lue/écrite directement : tout passe par
   des fonctions SQL qui vérifient le code atelier (côté admin)
   ou le token de la feuille (côté élève).
   Le code atelier n'est JAMAIS écrit dans le dépôt : il est
   saisi une fois par appareil et gardé en localStorage.
   ============================================================ */
(function(){
"use strict";

var CODE_KEY = 'mh_code_v1';
var cfg = window.MH_SUPABASE || {};
var sb = null;

function ws(){
  var w = (cfg.workspace == null ? '' : ('' + cfg.workspace)).trim();
  return w || (localStorage.getItem('mh_ws') || '').trim() || 'magic-hands';
}
function getCode(){ try{ return (localStorage.getItem(CODE_KEY) || '').trim(); }catch(e){ return ''; } }
function setCode(v){ try{ localStorage.setItem(CODE_KEY, (v || '').trim()); }catch(e){} }
function clearCode(){ try{ localStorage.removeItem(CODE_KEY); }catch(e){} }
function configured(){ return !!(cfg.url && cfg.anonKey); }

function client(){
  if(sb) return sb;
  if(!configured() || !window.supabase) return null;
  try{ sb = window.supabase.createClient(cfg.url, cfg.anonKey, {auth:{persistSession:false}}); }
  catch(e){ sb = null; }
  return sb;
}

/* Appel RPC générique -> Promise(data) ; rejette avec un message lisible */
function rpc(fn, args){
  var c = client();
  if(!c) return Promise.reject(new Error('Supabase non configuré'));
  return c.rpc(fn, args || {}).then(function(r){
    if(r.error) throw new Error(traduire(r.error.message || 'erreur'));
    return r.data;
  });
}
function traduire(m){
  m = '' + m;
  if(/code_invalide/.test(m))     return 'Code atelier invalide';
  if(/lien_invalide/.test(m))     return 'Lien invalide ou expiré';
  if(/hors_jour/.test(m))         return "On ne peut signer que le jour de la ligne";
  if(/deja_valide/.test(m))       return 'Signature déjà validée par la formatrice';
  if(/feuille_cloturee/.test(m))  return 'Feuille clôturée';
  if(/ligne_inconnue/.test(m))    return 'Ligne introuvable';
  if(/case_non_signee/.test(m))   return 'Cette case n\'est pas encore signée';
  if(/signature_invalide/.test(m))return 'Signature vide ou trop lourde';
  if(/slot_invalide/.test(m))     return 'Créneau invalide';
  if(/Failed to fetch|NetworkError/i.test(m)) return 'Pas de réseau';
  return m;
}

/* ---------- API admin (gérante) ---------- */
var admin = {
  list:   function(){ return rpc('mh_em_list',   {p_ws:ws(), p_code:getCode()}); },
  save:   function(eleveId, formation, data, opt){
            opt = opt || {};
            return rpc('mh_em_save', {
              p_ws:ws(), p_code:getCode(), p_eleve_id:eleveId,
              p_formation:formation || '', p_data:data || {},
              p_statut:opt.statut || null,
              p_archived:(opt.archived === undefined ? null : opt.archived),
              p_locked:(opt.locked === undefined ? null : opt.locked),
              p_sent:!!opt.sent
            });
          },
  del:    function(id){ return rpc('mh_em_delete', {p_ws:ws(), p_code:getCode(), p_id:id}); },
  valider:function(id, ligne, slot, on){
            return rpc('mh_em_validate', {p_ws:ws(), p_code:getCode(), p_id:id,
              p_ligne:ligne, p_slot:slot, p_on:(on === undefined ? true : !!on)});
          },
  stateGet:function(){ return rpc('mh_state_get', {p_ws:ws(), p_code:getCode()}); },
  statePut:function(d){ return rpc('mh_state_put', {p_ws:ws(), p_code:getCode(), p_data:d}); },
  stateRev:function(){ return rpc('mh_state_rev', {p_ws:ws(), p_code:getCode()}); }
};

/* ---------- API publique (élève, par token) ---------- */
var eleve = {
  get:  function(token){ return rpc('mh_em_get', {p_token:token}); },
  sign: function(token, ligne, slot, img, pts){
          return rpc('mh_em_sign', {p_token:token, p_ligne:ligne, p_slot:slot,
            p_img:img, p_pts:pts || [], p_ua:(navigator.userAgent || '').slice(0,300)});
        }
};

/* ---------- vérification du code ---------- */
function testCode(code){
  var prev = getCode();
  setCode(code);
  return admin.stateRev().then(function(){ return true; })
    .catch(function(e){ setCode(prev); throw e; });
}

window.MHapi = {
  ws:ws, getCode:getCode, setCode:setCode, clearCode:clearCode,
  configured:configured, rpc:rpc, admin:admin, eleve:eleve, testCode:testCode,
  hasCode:function(){ return !!getCode(); }
};
})();
