export const ReactiveAggregate = (sub, collection, pipeline, options) => {
  import { Promise } from 'meteor/promise';
  import { _ } from 'meteor/underscore';

  const defaultOptions = {
    aggregationOptions: {},
    observeSelector: {},
    observeOptions: {},
    clientCollection: collection._name,
    wait: 250,
    waitStrategy: 'throttle'
  };
  options = _.extend(defaultOptions, options);

  let initializing = true;
  sub._ids = {};
  sub._iteration = 0;

  const doUpdate = async () => {
    try {
      const docs = await collection.rawCollection().aggregate(pipeline, options.aggregationOptions).toArray();
      docs.forEach(doc => {
        if (!sub._ids[doc._id]) {
          sub.added(options.clientCollection, doc._id, doc);
        } else {
          sub.changed(options.clientCollection, doc._id, doc);
        }
        sub._ids[doc._id] = sub._iteration;
      });

      // remove documents not in the result anymore
      Object.keys(sub._ids).forEach(id => {
        if (sub._ids[id] !== sub._iteration) {
          delete sub._ids[id];
          sub.removed(options.clientCollection, id);
        }
      });
      sub._iteration++;
    } catch (err) {
      throw err;
    }
  }

  const waitAndUpdate = _[options.waitStrategy](doUpdate, options.wait);

  const update = () => {
    if (!initializing) {
      waitAndUpdate();
    }
  };

  // track any changes on the collection used for the aggregation
  const query = collection.find(options.observeSelector, options.observeOptions);
  const handle = query.observeChanges({
    added: update,
    changed: update,
    removed: update,
    error(err) {
      throw err;
    }
  });
  // observeChanges() will immediately fire an "added" event for each document in the query
  // these are skipped using the initializing flag
  initializing = false;
  // send an initial result set to the client
  Promise.await(doUpdate());
  // mark the subscription as ready
  sub.ready();

  // stop observing the cursor when the client unsubscribes
  sub.onStop(function () {
    handle.stop();
  });
};
