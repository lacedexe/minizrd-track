(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MiniZRDFirebaseSync=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  class FirebaseSyncError extends Error{
    constructor(message,code='sync-failed',status=0){super(message);this.name='FirebaseSyncError';this.code=code;this.status=status}
  }

  function endpointFor(databaseURL,path,token,extraParams={}){
    const safePath=String(path||'').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const params=new URLSearchParams({auth:token,...extraParams});
    return `${String(databaseURL||'').replace(/\/+$/,'')}/${safePath}.json?${params.toString()}`;
  }

  function utf8Bytes(value){
    if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(value).length;
    return typeof Buffer!=='undefined'?Buffer.byteLength(value,'utf8'):value.length;
  }

  const PROTECTED_ENTITY_COLLECTIONS=['seasons','drivers','tracks','races','teams','newsHistory'];

  function entityKey(item,index){
    if(item&&typeof item==='object')return String(item.id||item.storyKey||item.raceId||item.driverId||`index:${index}`);
    return `index:${index}:${String(item)}`;
  }

  function missingProtectedEntities(remote,snapshot){
    const missing=[];
    for(const collection of PROTECTED_ENTITY_COLLECTIONS){
      const before=Array.isArray(remote?.[collection])?remote[collection]:[];
      const after=Array.isArray(snapshot?.[collection])?snapshot[collection]:[];
      const afterKeys=new Set(after.map(entityKey));
      before.forEach((item,index)=>{
        const key=entityKey(item,index);
        if(!afterKeys.has(key))missing.push(`${collection}/${key}`);
      });
    }
    return missing;
  }

  function isContainer(value){
    return !!value&&typeof value==='object';
  }

  function buildUpdatePatch(remote,snapshot){
    const patch={};
    const visit=(before,after,path)=>{
      if(Object.is(before,after))return;
      if(after===undefined){if(path)patch[path]=null;return}
      if(before===undefined){if(path)patch[path]=after;return}
      const sameContainer=isContainer(before)&&isContainer(after)&&Array.isArray(before)===Array.isArray(after);
      if(!sameContainer){if(path)patch[path]=after;return}
      const keys=new Set([...Object.keys(before),...Object.keys(after)]);
      for(const key of keys)visit(before[key],after[key],path?`${path}/${key}`:key);
    };
    visit(remote,snapshot,'');
    return patch;
  }

  function oversizedStrings(value,maxBytes=10*1024*1024){
    const found=[];
    const visit=(item,path)=>{
      if(typeof item==='string'){
        const bytes=utf8Bytes(item);
        if(bytes>maxBytes)found.push({path,bytes});
        return;
      }
      if(item&&typeof item==='object')Object.entries(item).forEach(([key,child])=>visit(child,path?`${path}/${key}`:key));
    };
    visit(value,'');
    return found;
  }

  async function responseError(response,fallback){
    let detail='';
    try{
      const raw=String(await response.text()).slice(0,1000);
      try{detail=String(JSON.parse(raw)?.error||raw).slice(0,300)}catch(_){detail=raw.slice(0,300)}
    }catch(_){ }
    const error=new FirebaseSyncError(detail?`${fallback} ${detail}`:fallback,`http-${response.status}`,response.status);
    error.serverDetail=detail;
    return error;
  }

  async function conditionalPatch({databaseURL,path='minizrd_data',snapshot,expectedUpdatedAt,getIdToken,fetchImpl,allowedDeletions=[]}){
    if(!databaseURL)throw new FirebaseSyncError('Falta la URL de Firebase.','missing-database-url');
    if(!snapshot||typeof snapshot!=='object')throw new FirebaseSyncError('No hay datos válidos para sincronizar.','invalid-snapshot');
    if(typeof getIdToken!=='function')throw new FirebaseSyncError('No hay una sesión autenticada disponible.','missing-auth');
    const request=fetchImpl||(typeof fetch==='function'?fetch.bind(globalThis):null);
    if(!request)throw new FirebaseSyncError('El navegador no permite conectar con Firebase.','missing-fetch');

    const token=await getIdToken();
    if(!token)throw new FirebaseSyncError('La sesión de Firebase expiró.','missing-token');
    const readUrl=endpointFor(databaseURL,path,token);
    const currentResponse=await request(readUrl,{method:'GET',headers:{'X-Firebase-ETag':'true'},cache:'no-store'});
    if(!currentResponse.ok)throw await responseError(currentResponse,'Firebase rechazó la comprobación previa.');

    const etag=currentResponse.headers.get('etag');
    if(!etag)throw new FirebaseSyncError('Firebase no devolvió el control de versión ETag.','missing-etag');
    const remote=await currentResponse.json();
    const remoteUpdatedAt=Number(remote?.updatedAt||0);
    if(remoteUpdatedAt!==Number(expectedUpdatedAt||0)){
      return{ok:false,conflict:true,code:'version-conflict',remoteUpdatedAt};
    }

    const missing=missingProtectedEntities(remote,snapshot);
    const allowed=new Set(Array.isArray(allowedDeletions)?allowedDeletions.map(String):[]);
    const unauthorizedMissing=missing.filter(key=>!allowed.has(key));
    if(unauthorizedMissing.length){
      const error=new FirebaseSyncError('La protección de datos bloqueó una escritura que habría eliminado registros existentes.','destructive-write-blocked');
      error.missing=unauthorizedMissing;
      error.allMissing=missing;
      throw error;
    }

    const patch=buildUpdatePatch(remote,snapshot);
    const tooLarge=oversizedStrings(patch);
    if(tooLarge.length){
      const error=new FirebaseSyncError('Una imagen o texto supera el límite individual de 10 MB de Firebase.','firebase-string-too-large');
      error.oversized=tooLarge;
      throw error;
    }
    const payload=JSON.stringify(patch);
    const writeUrl=endpointFor(databaseURL,path,token,{print:'silent',writeSizeLimit:'unlimited'});
    const writeResponse=await request(writeUrl,{method:'PATCH',headers:{'Content-Type':'application/json'},body:payload,cache:'no-store'});
    if(writeResponse.status===412)return{ok:false,conflict:true,code:'etag-conflict',remoteUpdatedAt};
    if(!writeResponse.ok)throw await responseError(writeResponse,'Firebase rechazó la escritura.');
    return{ok:true,conflict:false,updatedAt:Number(snapshot.updatedAt||0),bytes:utf8Bytes(payload),changedPaths:Object.keys(patch).length,protectedRecordsChecked:PROTECTED_ENTITY_COLLECTIONS.length};
  }

  return{FirebaseSyncError,conditionalPatch,conditionalPut:conditionalPatch,endpointFor,utf8Bytes,buildUpdatePatch,oversizedStrings,missingProtectedEntities,PROTECTED_ENTITY_COLLECTIONS};
});
