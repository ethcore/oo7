// (C) Copyright 2016-2017 Parity Technologies (UK) Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//         http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const Bond = require('./bond');
const ReactiveBond = require('./reactiveBond');

let defaultContext = (typeof window === 'undefined' || typeof window.parity === 'undefined') ? null : window.parity.api;

function isPlain (x, depthLeft) {
	if (typeof x === 'object' && x !== null) {
		if (Bond.instanceOf(x)) {
			return false;
		} else if (x instanceof Promise) {
			return false;
		} else if (depthLeft > 0 && x.constructor === Array) {
			return x.every(i => isPlain(i, depthLeft - 1));
		} else if (depthLeft > 0 && x.constructor === Object) {
			return Object.keys(x).every(k => isPlain(x[k], depthLeft - 1));
		}
	}

	return true;
}

/**
 * @summary Configurable {@link Bond}-derivation representing a functional transformation
 * of a number of other items.
 * @description This is the underlying class which powers the {@link Bond#map} and {@link Bond#mapAll}
 * functions; you'll generally want to use those unless there is some particular
 * aspect of this class's configurability that you need.
 *
 * It is constructed with a transform function and a number of arguments; this
 * {@link Bond} represents the result of the function when applied to those arguemnts'
 * representative values. `Bond`s and `Promises`, are resolved automatically at
 * a configurable depth within complex structures, both as input items and
 * the value resulting from the transform function.
 */
class TransformBond extends ReactiveBond {
	/**
	 * Constructs a new object.
	 *
	 * @param {function} transform - The transformation function. It is called with
	 * values corresponding (in order) to the items of `args`. It may return a
	 * {@link Bond}, {Promise} or plain value resolving to representative values.
	 * @param {array} args - A list of items whose representative values should be
	 * passed to `transform`.
	 * @defaultValue [].
	 * @param {array} deps - A list of {@link Bond}s on which `transform` indirectly
	 * depends.
	 * @defaultValue [].
	 * @param {number} outResolveDepth - The depth in any returned structure
	 * that a {@link Bond} may be for it to be resolved.
	 * @defaultValue 0.
	 * @param {number} resolveDepth - The depth in a structure (array or object)
	 * that a {@link Bond} may be in any of `args`'s items for it to be resolved
	 * (in place) to its representative value. Beyond this depth, {@link Bond}s amd
	 * {Promise}s will be left alone.
	 * @defaultValue 1.
	 * @param {number} latched - If `false`, this object becomes _not ready_ as
	 * long as there is an output value waiting for resolution.
	 * @defaultValue `true`
	 * @param {boolean} mayBeNull - If `false`, a resultant value of `null` from
	 * `transform` causes this {@link Bond} to become _not ready_. Optional.
	 * @defaultValue `true`
	 * @param {object} context - The context (i.e. `this` object) that `transform`
	 * is bound to. Optional; defaults to the value set by {@link setDefaultTransformBondContext}.
	 * @defaultValue `null`
	 *
	 *
	 */
	constructor (transform, args = [], deps = [], outResolveDepth = 0, resolveDepth = 1, latched = true, mayBeNull = true, context = defaultContext) {
		super(args, deps, function (values) {
			// console.log(`Applying: ${JSON.stringify(args)}`);
			this.dropOut();
			let r = transform.apply(context, values);
			if (typeof r === 'undefined') {
				console.warn(`Transformation returned undefined: Applied ${context} to ${JSON.stringify(values)}.`);
				this.reset();
			} else if (r instanceof Promise) {
				if (!latched) {
					this.reset();
				}
				r.then(this.changed.bind(this));
			} else if (!isPlain(r, outResolveDepth)) {
				// console.log(`Using ReactiveBond to resolve and trigger non-plain result (at depth ${outResolveDepth})`);
				if (!latched) {
					this.reset();
				}
				this.useOut(new ReactiveBond([r], [], ([v]) => {
					// console.log(`Resolved results: ${JSON.stringify(v)}. Triggering...`);
					this.changed.bind(this)(v);
				}, false, outResolveDepth));
			} else {
				this.changed(r);
			}
		}, mayBeNull, resolveDepth);
		this._outBond = null;
	}

	useOut (b) {
		this._outBond = b.use();
	}

	dropOut () {
		if (this._outBond !== null) {
			this._outBond.drop();
		}
		this._outBond = null;
	}

	finalise () {
		this.dropOut();
		ReactiveBond.prototype.finalise.call(this);
	}
}

/**
 * Set the default context under which {@link Bond} transformations run.
 *
 * @see {@link Bond#map} {@link Bond#mapAll} {@link TransformBond}
 */
TransformBond.setDefaultContext = function (c) {
	defaultContext = c;
};

module.exports = TransformBond;
