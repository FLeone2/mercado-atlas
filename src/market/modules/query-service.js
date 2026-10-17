/* Session-scoped worker ownership. Clients cancel only their own subscriptions. */
(function(root){
 const services=new Map();
 function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
 function createSharedQueryWorker(factory,family){
  let service=services.get(family);
  if(!service){
   const worker=factory();service={worker,clients:new Set(),queue:[],active:null,serial:0};services.set(family,service);
   service.pump=()=>{if(service.active)return;const next=service.queue.shift();if(!next)return;service.active=next;try{worker.postMessage({...next.data,id:next.id});}catch(error){service.finish({id:next.id,error:error.message});}};
   service.finish=data=>{const active=service.active;if(!active||data.id!==active.id)return;for(const [client,id]of [...active.subscribers])if(!client.closed)client.onmessage?.({data:{...data,id}});if(!data.progress){service.active=null;service.pump();}};
   worker.onmessage=({data})=>service.finish(data);
   worker.onerror=error=>{const tasks=[service.active,...service.queue].filter(Boolean);service.active=null;service.queue=[];worker.terminate();services.delete(family);for(const task of tasks)for(const client of task.subscribers.keys())if(!client.closed)client.onerror?.(error);};
  }
  const client={closed:false,onmessage:null,onerror:null};service.clients.add(client);
  const detach=()=>{
   for(const task of service.queue)task.subscribers.delete(client);service.queue=service.queue.filter(task=>task.subscribers.size);
   if(service.active){service.active.subscribers.delete(client);if(!service.active.subscribers.size){service.worker.postMessage({type:'cancel'});service.active=null;service.pump();}}
  };
  client.postMessage=data=>{
   if(client.closed)throw Error('Query client closed.');
   if(data.type==='cancel'){detach();return;}
   if(data.type==='clear-cache'){detach();/* Explicit invalidation never cancels other clients. */if(!service.active&&!service.queue.length)service.worker.postMessage(data);return;}
   const {id,...body}=data,key=JSON.stringify(stable(body));
   // Subscribe to an identical active request before detaching an older subscription.
   const identical=[service.active,...service.queue].find(task=>task&&task.key===key);
   if(identical){for(const task of service.queue)if(task!==identical)task.subscribers.delete(client);service.queue=service.queue.filter(task=>task.subscribers.size||task===identical);if(service.active&&service.active!==identical){service.active.subscribers.delete(client);if(!service.active.subscribers.size){service.worker.postMessage({type:'cancel'});service.active=null;}}identical.subscribers.set(client,id);service.pump();return;}
   detach();service.queue.push({id:++service.serial,key,data:body,subscribers:new Map([[client,id]])});service.pump();
  };
  client.terminate=()=>{if(client.closed)return;detach();client.closed=true;service.clients.delete(client);};
  return client;
 }
 function clearSharedQueryServices(){for(const service of services.values())service.worker.terminate();services.clear();}
 root.createSharedQueryWorker=createSharedQueryWorker;
 // Preserve the host authored module's exports object when embedded in a dashboard.
 if(typeof module!=='undefined'&&module.exports)Object.assign(module.exports,{createSharedQueryWorker,clearSharedQueryServices});
})(globalThis);
