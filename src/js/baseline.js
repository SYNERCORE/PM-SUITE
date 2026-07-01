// ── SHIC Baseline Engine ─────────────────────────────────────
(function(){
  const MAX_BASELINES = 3;

  function _genId(){
    return 'BL-'+Date.now().toString(36).toUpperCase().slice(-6);
  }

  function _getProject(projectId){
    return (AppState.data.projects||[]).find(p=>p.id===projectId);
  }

  // Capture a snapshot of the current plan for a project
  function setBaseline(projectId, name){
    const p=_getProject(projectId);
    if(!p)return {ok:false,msg:'Project not found'};
    if(!p.baselines)p.baselines=[];
    if(p.baselines.length>=MAX_BASELINES)return {ok:false,msg:`Max ${MAX_BASELINES} baselines reached. Delete one first.`};

    const tasks=(AppState.data.tasks||[])
      .filter(t=>t.projectId===projectId&&!t._deleted)
      .map(t=>({
        id:t.id,
        name:t.name,
        startDate:t.startDate||'',
        endDate:t.endDate||t.dueDate||'',
        durationHrs:t.durationHrs||0,
        progress:t.progress||0,
      }));

    const bl={
      id:_genId(),
      name:name||('Baseline '+(p.baselines.length+1)),
      createdAt:new Date().toISOString().split('T')[0],
      createdBy:(AppState.currentUser?.displayName||AppState.currentUser?.name||''),
      projectEndDate:p.endDate||'',
      projectBudget:p.budget||0,
      tasks,
    };

    p.baselines.push(bl);
    if(!p.activeBaseline)p.activeBaseline=bl.id;
    AppState.save();
    return {ok:true,baseline:bl};
  }

  function deleteBaseline(projectId, baselineId){
    const p=_getProject(projectId);
    if(!p||!p.baselines)return;
    p.baselines=p.baselines.filter(b=>b.id!==baselineId);
    if(p.activeBaseline===baselineId){
      p.activeBaseline=p.baselines.length?p.baselines[p.baselines.length-1].id:null;
    }
    AppState.save();
  }

  function setActiveBaseline(projectId, baselineId){
    const p=_getProject(projectId);
    if(!p)return;
    p.activeBaseline=baselineId;
    AppState.save();
  }

  function getActiveBaseline(projectId){
    const p=_getProject(projectId);
    if(!p||!p.activeBaseline||!p.baselines)return null;
    return p.baselines.find(b=>b.id===p.activeBaseline)||null;
  }

  function getBaselineTask(projectId, taskId){
    const bl=getActiveBaseline(projectId);
    if(!bl)return null;
    return bl.tasks.find(t=>t.id===taskId)||null;
  }

  // Returns schedule variance in calendar days (positive = ahead, negative = behind)
  function calcSV(actualEndDate, baselineEndDate){
    if(!actualEndDate||!baselineEndDate)return null;
    const a=new Date(actualEndDate);
    const b=new Date(baselineEndDate);
    return Math.round((b-a)/86400000); // positive = finishing earlier than baseline
  }

  // Cost variance: positive = under budget
  function calcCV(project){
    const bl=getActiveBaseline(project.id);
    if(!bl||!bl.projectBudget)return null;
    return bl.projectBudget-(project.budget||0);
  }

  window.SHICBaseline={
    MAX_BASELINES,
    setBaseline,
    deleteBaseline,
    setActiveBaseline,
    getActiveBaseline,
    getBaselineTask,
    calcSV,
    calcCV,
  };
})();
