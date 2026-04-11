function tea(initialState,reducer,options){return(set,get)=>{let dispatch=(op)=>{let{dispatch:_,...currentState}=get(),result=reducer(currentState,op),[newState,effects]=Array.isArray(result)?result:[result,[]];if(set(newState),effects.length>0&&options?.runners)for(let effect of effects){let runner=options.runners[effect.type];if(runner)runner(effect,dispatch)}};return{...initialState,dispatch}}}function collect(result){if(Array.isArray(result))return result;return[result,[]]}export{tea,collect};

//# debugId=9E7E1FA1477B656064756E2164756E21
