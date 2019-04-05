import {$nt, errMsg, extend, isFunction, isNumber, isString, isUndef, isValidChildren, uniqueId} from '../core/util';
import VNode from "./vNode";
import VData from "./vData";
import Vue from 'vue';

const upperCaseReg = /[A-Z]/;

export function isAttr(name, value) {
    return (!upperCaseReg.test(name) && (isString(value) || isNumber(value)))
}

export default class Render {

    constructor(vm, handler, options = {}) {
        this.vm = vm;
        this.handler = handler;
        this.options = options;
        this.vNode = new VNode(vm);
        this.vData = new VData;
        this.cache = null;
        this.$tickEvent = [];

        this.init();
    }

    init() {

    }

    cacheParse(form, _super) {
        let {noValue, noCache} = this.handler;
        if (!this.cache || noValue === true || noCache === true)
            this.cache = _super ? _super.parse.call(this, form) : this.parse(form);
        let eventList = [...this.$tickEvent];
        this.$tickEvent = [];
        if (eventList.length)
            $nt(() => {
                eventList.forEach(event => event());
            });
        return this.cache
    }

    sync(event) {
        if (isFunction(event))
            this.$tickEvent.push(event);
        this.clearCache();
        this.vm._sync();
    }

    clearCache() {
        this.cache = null;
        let children = this.handler.rule.children;

        if (isValidChildren(children))
            children.forEach(child => !isString(child) && child.__handler__.render.clearCache());
    }

    parse(form) {
        let {type, rule, refName, key, noValue, vm, orgChildren} = this.handler;

        if (rule.type === 'template') {
            if (Vue.compile !== undefined) {
                if (isUndef(rule.vm)) rule.vm = new Vue;

                let vn = Vue.compile(rule.template, {}).render.call(rule.vm);
                if (vn.data === undefined) vn.data = {};
                extend(vn.data, rule);
                vn.key = key;
                return [vn];
            } else {
                console.error('使用的 Vue 版本不支持 compile' + errMsg());
                return [];
            }
        } else if (!noValue) {
            return form.makeComponent(this.handler.render);
        } else {
            rule.ref = refName;
            if (isUndef(rule.key))
                rule.key = 'def' + uniqueId();
            let vn = this.vNode.make(type, {...rule}, () => {
                let vn = [], children = rule.children;

                if (isValidChildren(children)) {
                    orgChildren.forEach(_rule => {
                        if (children.indexOf(_rule) === -1) {
                            vm._fComponent.removeField(_rule.__field__);
                        }
                    });

                    vn = children.map((child, i) => {
                        if (isString(child))
                            return [child];
                        if (!child.__handler__)
                            children[i] = child = vm._fComponent.createHandler([child], true)[0];
                        return child.__handler__.render.cacheParse(form, this);
                    });
                    this.handler.orgChildren = [...children];
                } else if (orgChildren.length > 0) {
                    orgChildren.forEach(_rule => {
                        vm._fComponent.removeField(_rule.__field__);
                    });
                    this.handler.orgChildren = [];
                }

                return vn;
            });

            vn.key = key;
            return [vn];
        }

    }

    inputProps() {
        let {refName, key, field, rule: {props, event}} = this.handler;
        let data = this.vData
            .props(props).props({value: this.vm._formData(field)})
            .ref(refName).key(key + 'fc' + field).on(event).on('input', (value) => {
                this.onInput(value)
            });

        if (process.env.UI !== 'iview')
            data.attrs(Object.keys(props).reduce((initial, val) => {
                if (isAttr(val, props[val]))
                    initial[val] = props[val];
                return initial;
            }, {}));

        if (isUndef(props.size))
            data.props({size: this.options.form.size});

        return data;
    }

    onInput(value) {
        value = isUndef(value) ? '' : value;
        let handler = this.handler, {field, vm} = this.handler, trueValue = handler.toValue(value);
        vm._changeFormData(field, value);
        if (!vm._change(field, trueValue)) return;
        handler.setValue(trueValue);
        handler.watchFormValue(value);
        if (process.env.UI !== 'iview')
            handler.render.sync();
    }

}

export function defaultRenderFactory(node, key = false) {
    return class render extends Render {
        parse() {
            const props = this.inputProps();
            if (key)
                props.key(this.handler.key);

            return [this.vNode[node](props.get())];
        }
    }

}
