const BoardFactory = require("./boardFactory");

(function () {
  const NoLimits = function () {
    return {
      allowsNewWork: () => true
    };
  };

  let Board = function (workColumnNames) {
    let columns = [];
    const workers = [];
    const backlogColumn = () => columns[0];
    const firstWorkColumn = () => columns[1];
    const doneColumn = () => columns[columns.length - 1];
    const workColumns = () => columns.filter(column => column.type === 'work');
    const addWorkers = (...newWorkers) => newWorkers.forEach(worker => workers.push(worker));
    const addWorkItems = (...items) => items.forEach(item => backlogColumn().add(item));
    let allowNewWork = true;

    const board = {
      addWorkers,
      addWorkItems,
      columns,
      items: () => columns.map(column => column.items())
    };

    function initialize(workColumnNames) {
      const factory = new BoardFactory();
      columns = factory.createColumns(workColumnNames);
      PubSub.publish('board.ready', {columns});
    }

    initialize(workColumnNames);

    PubSub.subscribe('workitem.added', (topic, subject) => {
      assignNewWorkIfPossible();
    });

    PubSub.subscribe('board.allowNewWork', (topic, subject) => {
      allowNewWork = true;
      assignNewWorkIfPossible();
    });

    function assignNewWorkIfPossible() {
      const columnWithWork = workColumns()
        .reverse()
        .filter(column => column.inbox.hasWork())
        .filter(column => workers.some(worker => worker.canWorkOn(column.necessarySkill)))[0];

      if (columnWithWork) {
        if (columnWithWork.inbox === backlogColumn() && !allowNewWork)
          return;

        const availableWorker = workers
          .filter(worker => worker.canWorkOn(columnWithWork.necessarySkill))
          .reduce((bestCandidate, worker) => {
            if(!bestCandidate) return worker;
            const bestScore = bestCandidate.canWorkOn(columnWithWork.necessarySkill);
            const currentScore = worker.canWorkOn(columnWithWork.necessarySkill);
            return bestScore > currentScore ? bestCandidate : worker;
          });

        if (availableWorker) {
          availableWorker.startWorkingOn(columnWithWork.inbox, columnWithWork, columnWithWork.outbox);
        }
      }
    }

    PubSub.subscribe('board.denyNewWork', (topic, subject) => {
      allowNewWork = false;
    });

    PubSub.subscribe('workitem.added', (topic, subject) => {
      const item = subject.item;
      let column1 = firstWorkColumn();
      if (column1 && subject.column.id === column1.id) {
        item.startTime = Date.now();
        PubSub.publish('workitem.started', item);
      }
      if (subject.column.id === doneColumn().id) {
        item.endTime = Date.now();
        item.duration = item.endTime - item.startTime;
        PubSub.publish('workitem.finished', item);
      }
    });

    return board
  };

  module.exports = Board
})();