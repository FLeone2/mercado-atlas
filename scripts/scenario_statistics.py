"""Transparent exploratory statistics. No causal or financial interpretation."""
import numpy as np


def distribution(values):
    a = np.asarray([v for v in values if v is not None and np.isfinite(v)], dtype=float)
    if not len(a): return {'n': 0, 'quantiles': None, 'histogram': []}
    q = np.quantile(a, [0, .05, .25, .5, .75, .95, 1])
    counts, edges = np.histogram(a, bins='fd' if len(a) > 1 else 1)
    iqr = q[4] - q[2]
    return {'n': len(a), 'mean': float(a.mean()), 'sd': float(a.std(ddof=1)) if len(a)>1 else None,
            'quantiles': dict(zip(['min','p05','q1','median','q3','p95','max'], map(float,q))),
            'tukeyFences': [float(q[2]-1.5*iqr), float(q[4]+1.5*iqr)],
            'histogram': [{'lo':float(edges[i]),'hi':float(edges[i+1]),'n':int(c)} for i,c in enumerate(counts)],
            'normalityAssumed': False}


def predict(y, horizon, model):
    y=np.asarray(y,dtype=float); n=len(y)
    if model=='naive': return np.repeat(y[-1],horizon)
    if model=='seasonal_naive': return np.array([y[n-12+(h%12)] for h in range(horizon)])
    if model=='seasonal_trend':
        # Fixed specification; all coefficients estimated exclusively on training observations.
        def design(t): return np.column_stack([np.ones(len(t)),t/12,*[(t%12==i).astype(float) for i in range(1,12)]])
        beta=np.linalg.lstsq(design(np.arange(n)),y,rcond=None)[0]
        return np.maximum(0,design(np.arange(n,n+horizon))@beta)
    raise ValueError(model)


def evaluate(y, origins, horizon, model):
    residuals=[[] for _ in range(horizon)]; scaled=[]; absolute=[]; details=[]
    for end in origins:
        train=y[:end]; p=predict(train,horizon,model); scale=float(np.mean(np.abs(train[12:]-train[:-12])))
        for h in range(horizon):
            e=float(y[end+h]-p[h]); residuals[h].append(e);absolute.append(abs(e))
            if scale>0: scaled.append(abs(e)/scale)
            details.append({'trainEndIndex':end-1,'targetIndex':end+h,'horizon':h+1,'actual':float(y[end+h]),'predicted':float(p[h])})
    return {'mae':float(np.mean(absolute)) if absolute else None,'mase':float(np.mean(scaled)) if scaled else None,
            'nPredictions':len(absolute),'byHorizon':[{'horizon':h+1,'mae':float(np.mean(np.abs(e))),'n':len(e)} for h,e in enumerate(residuals)]},residuals,details


def forecast(months, values, horizon=6):
    y=np.asarray(values,dtype=float); n=len(y)
    if n<96 or not np.isfinite(y).all() or np.mean(y[-24:])<30 or np.count_nonzero(y[-24:])<18:
        return {'status':'insufficient_data','reason':'Requires 96 consecutive months, recent mean ≥30 and ≥18 positive months of last 24.'}
    # Validation targets end before untouched test period starts. No overlapping target leakage.
    test_start=n-24
    validation=range(48,test_start-horizon+1)
    test=range(test_start,n-horizon+1)
    models=['naive','seasonal_naive','seasonal_trend']; scores={}; errors={}
    for model in models:
        scores[model],errors[model],_=evaluate(y,validation,horizon,model)
    chosen=min(models,key=lambda m:scores[m]['mae'])
    test_scores={m:evaluate(y,test,horizon,m)[0] for m in models}
    _,_,details=evaluate(y,test,horizon,chosen)
    # Empirical pre-test residual quantiles, horizon-specific; no normality claim.
    intervals=[]; point=predict(y,horizon,chosen)
    for h in range(horizon):
        e=np.asarray(errors[chosen][h]);q=np.quantile(e,[.025,.1,.9,.975]); p=float(point[h])
        intervals.append({'horizon':h+1,'point':p,'lo80':min(p,max(0,p+float(q[1]))),'hi80':max(p,max(0,p+float(q[2]))),'lo95':min(p,max(0,p+float(q[0]))),'hi95':max(p,max(0,p+float(q[3]))),'calibrationN':len(e)})
    coverage={}
    for pct,lo,hi in [(80,.1,.9),(95,.025,.975)]:
        covered=[]
        for d in details:
            q=np.quantile(errors[chosen][d['horizon']-1],[lo,hi]); covered.append(min(d['predicted'],max(0,d['predicted']+q[0]))<=d['actual']<=max(d['predicted'],d['predicted']+q[1]))
        coverage[str(pct)]=float(np.mean(covered))
    passed = test_scores[chosen]['mae'] <= min(test_scores[m]['mae'] for m in ['naive','seasonal_naive']) and coverage['80'] >= .70 and coverage['95'] >= .85
    return {'status':'available','validationPassed':passed,'qualityStatus':'passed' if passed else 'failed_validation','usage':'exploratory_only' if not passed else 'validated_univariate_benchmark','selectedModel':chosen,'selectionMetric':'validation MAE','trainedThrough':months[-1],
            'validationTargetRange':[months[48],months[test_start-1]],'testTargetRange':[months[test_start],months[-1]],
            'validation':scores,'test':test_scores,'intervals':intervals,'testIntervalCoverage':coverage,
            'intervalMethod':'Empirical horizon-specific validation residual quantiles, clipped at zero. Approximate; overlap/autocorrelation and structural breaks prevent guaranteed coverage.',
            'lowVolumeGuard':True,'vintageWarning':'Retrospective rolling-origin test using current source vintage; historical publication vintages unavailable.',
            'exogenousInputs':False,'testPredictions':details}


def lag_correlations(months, registrations, macro, rate=False):
    """Calendar-aligned YoY transformations, then partial out month and linear trend."""
    idx={m:i for i,m in enumerate(months)}; y=np.asarray(registrations,float)
    output=[]; pairs_by_lag={}
    for lag in range(13):
        pairs=[]
        for i in range(12+lag,len(months)):
            j=i-lag; now=macro.get(months[j]); prev=macro.get(months[j-12])
            if now is None or prev is None or y[i-12]<=0 or (not rate and prev<=0):continue
            x=now-prev if rate else now/prev-1
            pairs.append((i,x,y[i]/y[i-12]-1))
        if len(pairs)<36:output.append({'lag':lag,'n':len(pairs),'r':None});continue
        a=np.asarray(pairs);t=a[:,0];z=np.column_stack([np.ones(len(t)),t,*[(t%12==m).astype(float) for m in range(1,12)]])
        xr=a[:,1]-z@np.linalg.lstsq(z,a[:,1],rcond=None)[0];yr=a[:,2]-z@np.linalg.lstsq(z,a[:,2],rcond=None)[0]
        r=float(np.corrcoef(xr,yr)[0,1]) if xr.std()>1e-12 and yr.std()>1e-12 else None
        pairs_by_lag[str(lag)]=[{'month':months[int(t)],'macroMonth':months[int(t)-lag],'x':float(x),'y':float(y)} for t,x,y in zip(a[:,0],xr,yr)]
        output.append({'lag':lag,'n':len(a),'r':r})
    return {'status':'exploratory','rows':output,'pairsByLag':pairs_by_lag,'xUnit':'percentage points, residualized' if rate else 'relative YoY change, residualized','yUnit':'relative registration YoY change, residualized','transformation':'Rate: YoY percentage-point change; levels: YoY relative change; residualized month effects and linear trend.',
            'warning':'Association is not causation. Positive lag means macro leads registrations. Multiple lags and overlapping YoY observations invalidate naive significance claims; no p-values or causal response surface.'}
