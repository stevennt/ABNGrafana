import _ from 'lodash';
import {UI} from '../UI';

import { KEY_PLACEHOLDER, VALUE_PLACEHOLDER } from '../constants';

const orders = [
    { label: 'DESC' },
    { label: 'ASC' },
];

export class Query {

    constructor(uiSegmentSrv, parentQuery) {
        this.uiSegmentSrv = uiSegmentSrv;
        this.clauses = [];
        this.orderBy = [];
        this.root = false;
        this.parentQuery = parentQuery;

        this.orders = orders;
        this.order = orders[0];
    }

    clear() {
        this.clauses = [];
        this.orderBy = [];
    }

    isEmpty() {
        return this.getSize() == 0;
    }

    getSize() {
        return this.clauses.length;
    }

    getLastClause() {
        if (this.clauses.length == 0) {
            return null;
        }
        return this.clauses[this.getSize() - 1];
    }

    setOrder(order) {
        this.order = orders.filter((o) => o.label.toLowerCase() === order.toLowerCase())[0] || orders[0];
    }

    updateControls() {
        const self = this;

        // at least one row should be available even if it is a dummy row
        if (this.getSize() == 0) {
            this.createNewEmptyClause();
        }
        _.each(this.clauses, clause => {
            clause.updateControls(self);
        });

        if (this.orderBy.length === 0 || !this.orderBy[this.orderBy.length - 1].isFake()) {
            this.createNewEmptyOrderBy();
        }
    }

    addClause(clause, index) {
        if (clause) {
            if (!clause.uiSegmentSrv) {
                clause.uiSegmentSrv = this.uiSegmentSrv;
            }
            if (index !== undefined) {
                this.clauses.splice(index, 0, clause);
            } else {
                this.clauses.push(clause);
            }
        }
    }

    removeClause(clause) {
        if (clause) {
            var index = this.clauses.indexOf(clause);
            if (index >= 0) {
                this.clauses.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    addOrderBy(orderBy, index) {
        if (this.root && orderBy) {
            if (!orderBy.uiSegmentSrv) {
                orderBy.uiSegmentSrv = this.uiSegmentSrv;
            }
            if (index !== undefined) {
                this.orderBy.splice(index, 0, orderBy);
            } else {
                this.orderBy.push(orderBy);
            }
        }
    }

    removeOrderBy(orderBy) {
        if (this.root && orderBy) {
            var index = this.orderBy.indexOf(orderBy);
            if (index >= 0) {
                this.orderBy.splice(index, 1);
                return true;
            }
        }
        return false;
    }

    asString() {
        if (this.isEmpty()) {
            return "";
        }
        let ret = this.clauses.map((clause, index) => {
            let string = '';
            if (clause.restriction instanceof UI.Query) {
                const subString = clause.restriction.asString();
                if (subString && subString.length > 0) {
                    string += "(" + subString + ")";
                }
            } else if (clause.restriction) {
                const restrictionString = clause.restriction.asString();
                if (restrictionString && restrictionString.length > 0) {
                    string += restrictionString;
                }
            } else {
                throw {message: "Clause does not contain restriction. Bailing", clause: clause};
            }

            // Append operator if we have anything generated
            if (string.length > 0  && index > 0 && clause.operator && clause.operator.value) {
                string = " " + clause.operator.value.toLowerCase() + " " + string;
            }
            return string;
        }).join("");

        if (this.root && this.orderBy.length > 0) {
            ret += ' ' + this.orderBy.map((orderBy) => orderBy.asString()).join(', ');
        }

        return ret;
    }

    createNewEmptyOrderBy(index) {
        const newOrderBy = new UI.OrderBy(this.uiSegmentSrv, KEY_PLACEHOLDER, true);
        this.addOrderBy(newOrderBy, index);
        return newOrderBy;
    }

    createNewEmptyClause(index) {
        const newClause = new UI.Clause(this.uiSegmentSrv, UI.Operators.AND, new UI.Restriction(this.uiSegmentSrv));
        newClause.restriction.addSegment(this.uiSegmentSrv.newKey(KEY_PLACEHOLDER));
        newClause.restriction.addSegment(this.uiSegmentSrv.newOperator('='));
        newClause.restriction.addSegment(this.uiSegmentSrv.newFake(VALUE_PLACEHOLDER, 'value', 'query-segment-value'));
        this.addClause(newClause, index);
        return newClause;
    }

    createNewEmptyNestedClause(index) {
        const newQuery = new UI.Query(this.uiSegmentSrv, this);
        newQuery.createNewEmptyClause();
        const newClause = new UI.Clause(this.uiSegmentSrv, UI.Operators.AND, newQuery);
        this.addClause(newClause, index);
        return newQuery;
    }

    findParent() {
        if (this.parentQuery) {
            return this.parentQuery.findParent();
        }
        return this;
    }
}
