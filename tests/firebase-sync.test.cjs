const test=require('node:test');
const assert=require('node:assert/strict');
const {conditionalPut,endpointFor,utf8Bytes}=require('../firebase-sync.js');

function response({status=200,etag='"etag-1"',json={},text=''}){
  return{
    ok:status>=200&&status<300,
    status,
    headers:{get:name=>String(name).toLowerCase()==='etag'?etag:null},
    json:async()=>json,
    text:async()=>text
  };
}

test('builds an authenticated Firebase REST endpoint without changing the data path',()=>{
  const url=endpointFor('https://example.firebaseio.com/','minizrd_data','token value',{print:'silent'});
  assert.equal(url,'https://example.firebaseio.com/minizrd_data.json?auth=token+value&print=silent');
});

test('writes a complete snapshot with ETag protection through REST',async()=>{
  const calls=[];
  const snapshot={updatedAt:101,seasons:[{id:'proam'}],drivers:[]};
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    return calls.length===1
      ?response({etag:'"root-version"',json:{updatedAt:100}})
      :response({status:204});
  };
  const result=await conditionalPut({databaseURL:'https://example.firebaseio.com',snapshot,expectedUpdatedAt:100,getIdToken:async()=>'id-token',fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(result.updatedAt,101);
  assert.equal(result.bytes,utf8Bytes(JSON.stringify(snapshot)));
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.headers['X-Firebase-ETag'],'true');
  assert.equal(calls[1].options.method,'PUT');
  assert.equal(calls[1].options.headers['If-Match'],'"root-version"');
  assert.equal(calls[1].options.body,JSON.stringify(snapshot));
  assert.match(calls[1].url,/writeSizeLimit=large/);
  assert.match(calls[1].url,/print=silent/);
});

test('does not write when the remote revision changed before the save',async()=>{
  let calls=0;
  const result=await conditionalPut({
    databaseURL:'https://example.firebaseio.com',
    snapshot:{updatedAt:101},
    expectedUpdatedAt:100,
    getIdToken:async()=>'id-token',
    fetchImpl:async()=>{calls++;return response({json:{updatedAt:999}})}
  });
  assert.equal(result.ok,false);
  assert.equal(result.conflict,true);
  assert.equal(result.code,'version-conflict');
  assert.equal(calls,1);
});

test('treats an ETag mismatch as a safe conflict without retrying or overwriting',async()=>{
  let calls=0;
  const result=await conditionalPut({
    databaseURL:'https://example.firebaseio.com',
    snapshot:{updatedAt:101},
    expectedUpdatedAt:100,
    getIdToken:async()=>'id-token',
    fetchImpl:async()=>{calls++;return calls===1?response({json:{updatedAt:100}}):response({status:412})}
  });
  assert.equal(result.ok,false);
  assert.equal(result.conflict,true);
  assert.equal(result.code,'etag-conflict');
  assert.equal(calls,2);
});

test('surfaces authentication and rules failures with their HTTP status',async()=>{
  await assert.rejects(
    conditionalPut({databaseURL:'https://example.firebaseio.com',snapshot:{updatedAt:1},expectedUpdatedAt:0,getIdToken:async()=>'bad-token',fetchImpl:async()=>response({status:401,text:'Permission denied'})}),
    error=>error.code==='http-401'&&error.status===401&&/Permission denied/.test(error.message)
  );
});
