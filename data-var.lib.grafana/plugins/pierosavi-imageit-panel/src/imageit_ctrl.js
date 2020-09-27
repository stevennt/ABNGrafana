/* eslint-disable class-methods-use-this */
/* eslint-disable func-names */
/* eslint-disable no-restricted-syntax */
/* eslint-disable import/prefer-default-export */
import _ from 'lodash';
import { MetricsPanelCtrl } from 'app/plugins/sdk';
import './libs/interact';
import kbn from 'app/core/utils/kbn';

const panelDefaults = {
    colorMappings: [],
    colorMappingMap: [],
    valueMappings: [],
    metricValues: [],
    seriesList: [],
    series: [],
    bgimage: '',
    realbgimage: '',
    sensors: [],
    templateSrv: null,
    sizecoefficient: 20,
    // uncache is a random number added to the img url to refresh it
    uncache: 0,
    islocked: false,
    islockvisible: true
};

const mappingOperators = [{
    name: 'equal',
    operator: '=',
    fn: isEqualTo
}, {
    name: 'greaterThan',
    operator: '>',
    fn: isGreaterThan
}, {
    name: 'lessThan',
    operator: '<',
    fn: isLessThan
}];

let isTheFirstRender = true;

export class ImageItCtrl extends MetricsPanelCtrl {
    constructor($scope, $injector, $sce, templateSrv) {
        super($scope, $injector);
        _.defaults(this.panel, panelDefaults);
        this.templateSrv = templateSrv;
        this.$sce = $sce;
        this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
        this.events.on('panel-initialized', this.render.bind(this));
        this.events.on('data-received', this.onDataReceived.bind(this));
        this.events.on('data-snapshot-load', this.onDataReceived.bind(this));
    }

    onDataReceived(dataList) {
        const dataListLength = dataList.length;
        this.panel.metricValues = [];
        for (let series = 0; series < dataListLength; series += 1) {
            this.panel.metricValues.push({
                name: dataList[series].target,
                value: dataList[series].datapoints[dataList[series].datapoints.length - 1][0]
            });
        }

        if (!isTheFirstRender) {
            this.refreshImage();
        } else {
            isTheFirstRender = false;
        }


        this.render();
    }

    refreshImage() {
        this.panel.uncache = Math.random();
    }

    deleteSensor(index) {
        this.panel.sensors.splice(index, 1);
    }

    addSensor() {
        this.panel.sensors.push(
            new Sensor()
        );
        this.render();
    }

    moveSensorUp(index) {
        const sensor = this.panel.sensors[index];
        this.panel.sensors.splice(index, 1);
        this.panel.sensors.splice(index - 1, 0, sensor);
    }

    moveSensorDown(index) {
        const sensor = this.panel.sensors[index];
        this.panel.sensors.splice(index, 1);
        this.panel.sensors.splice(index + 1, 0, sensor);
    }

    onInitEditMode() {
        this.addEditorTab('Sensor', 'public/plugins/pierosavi-imageit-panel/editor.html', 2);
        this.addEditorTab('Value Mapping', 'public/plugins/pierosavi-imageit-panel/mappings.html', 3);
        this.unitFormats = kbn.getUnitFormats();
        this.render();
    }

    toggleBlock() {
        this.panel.islocked = !this.panel.islocked;
        this.render();
    }

    link(scope, elem, attrs, ctrl) {
        const panelContainer = (elem.find('.pierosavi-imageit-panel')[0]);
        const image = (panelContainer.querySelector('#imageit-image'));
        const draggableElement = '#imageit_panel' + ctrl.panel.id + '_sensor';

        function render() {
            if (!ctrl.panel.sensors || (ctrl.panel.bgimage === '')) {
                return;
            }

            // Replace possible variables in image URL
            ctrl.panel.realbgimage = ctrl.templateSrv.replace(ctrl.panel.bgimage);

            const imageWidth = image.offsetWidth;
            const imageHeight = image.offsetHeight;

            const metricMap = _.keyBy(ctrl.panel.metricValues, value => value.name);
            const valueMappingsMap = _.keyBy(ctrl.panel.valueMappings, mapping => mapping.id);
            const mappingOperatorsMap = _.keyBy(mappingOperators, operator => operator.name);

            for (const sensor of ctrl.panel.sensors) {
                _.defaults(sensor, new Sensor());

                const sizeCoefficient = sensor.sizeCoefficient ? sensor.sizeCoefficient : ctrl.panel.sizecoefficient;

                sensor.size = imageWidth * sizeCoefficient / 1600;

                sensor.borderRadius = sensor.rectangular ? '5%' : '50%';

                sensor.xlocationStr = (sensor.xlocation * imageWidth / 100) + 'px';
                sensor.ylocationStr = (sensor.ylocation * imageHeight / 100) + 'px';

                if (sensor.link_url !== undefined) {
                    sensor.resolvedLink = ctrl.templateSrv.replace(sensor.link_url);
                }

                // We need to replace possible variables in the sensors name
                const effectiveName = ctrl.templateSrv.replace(sensor.metric);

                const metric = metricMap[effectiveName];

                const metricValue = (metric !== undefined) ? metric.value : undefined;

                // update existing valueMappings
                for (const valueMapping of ctrl.panel.valueMappings) {
                    if (valueMapping.mappingOperatorName == null) {
                        valueMapping.mappingOperatorName = mappingOperators[0].name;
                    }

                    if (valueMapping.id == null) {
                        valueMapping.id = getRandomId();
                    }
                }

                if (sensor.valueMappingIds === undefined) {
                    sensor.valueMappingIds = [];
                }

                if (sensor.valueMappingIds.length > 0) {
                    for (const mappingId of sensor.valueMappingIds) {
                        const valueMapping = valueMappingsMap[mappingId];

                        if (valueMapping === undefined) {
                            break;
                        }

                        const mappingOperator = mappingOperatorsMap[valueMapping.mappingOperatorName];

                        if (mappingOperator.fn(metricValue, valueMapping.compareTo)) {
                            sensor.realFontColor = valueMapping.fontColor;
                            sensor.realBgColor = valueMapping.bgColor;

                            sensor.nameBlink = valueMapping.nameBlink;
                            sensor.valueBlink = valueMapping.valueBlink;
                            sensor.bgBlink = valueMapping.bgBlink;

                            sensor.isBold = valueMapping.isSensorFontBold;

                            break;
                        } else {
                            normalizeSensor(sensor);
                        }
                    }
                } else {
                    normalizeSensor(sensor);
                }

                if (metricValue === undefined) {
                    sensor.valueFormatted = 'Select a sensor metric';
                } else {
                    const formatFunc = kbn.valueFormats[sensor.unitFormat];
                    sensor.valueFormatted = formatFunc(metricValue, sensor.decimals);
                }
            }

            dragEventSetup();
        }

        function normalizeSensor(sensor) {
            // new sensor property so it doesn't lose the original one
            // https://github.com/pierosavi/pierosavi-imageit-panel/issues/4
            sensor.realBgColor = sensor.bgColor;
            sensor.realFontColor = sensor.fontColor;

            sensor.nameBlink = false;
            sensor.valueBlink = false;
            sensor.bgBlink = false;

            sensor.isBold = false;
        }

        function dragEventSetup() {
            if (ctrl.panel.islocked) {
                if (window.interact.isSet(draggableElement)) {
                    window.interact(draggableElement).unset();
                }
            } else if (!window.interact.isSet(draggableElement)) {
                window.interact(draggableElement).draggable({
                    // I dont like it personally but this could be configurable in the future
                    inertia: false,
                    restrict: {
                        restriction: '#draggableparent',
                        endOnly: true,
                        elementRect: {
                            top: 0,
                            left: 0,
                            bottom: 1,
                            right: 1
                        }
                    },
                    autoScroll: true,
                    onmove: function (event) {
                        const {target} = event;
                        // keep the dragged position in the data-x/data-y attributes
                        const datax = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                        const datay = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

                        // translate the element
                        const elementTransform = 'translate(' + datax + 'px, ' + datay + 'px)';
                        target.style.webkitTransform = elementTransform;
                        target.style.transform = elementTransform;

                        // update the position attributes
                        target.setAttribute('data-x', datax);
                        target.setAttribute('data-y', datay);
                    },
                    onend: function (event) {
                        const {target} = event;

                        const imageHeight = image.offsetHeight;
                        const imageWidth = image.offsetWidth;

                        // find sensor with the id from the refId attribute on html
                        const sensor = _.find(ctrl.panel.sensors, {
                            'id': (event.target).getAttribute('refId')
                        });

                        // get relative distance in px
                        const datax = target.getAttribute('data-x');
                        const datay = target.getAttribute('data-y');

                        // get percentage of relative distance from starting point
                        const xpercentage = (datax * 100) / imageWidth;
                        const ypercentage = (datay * 100) / imageHeight;

                        sensor.xlocation += xpercentage;
                        sensor.ylocation += ypercentage;

                        // reset the starting sensor points
                        target.setAttribute('data-x', 0);
                        target.setAttribute('data-y', 0);

                        // target.style.webkitTransform = '';
                        target.style.transform = '';

                        target.style.left = (sensor.xlocation * imageWidth / 100) + 'px';
                        target.style.top = (sensor.ylocation * imageHeight / 100) + 'px';
                    }
                });
            }
        }

        this.events.on('render', function () {
            render();
            ctrl.renderingCompleted();
        });
    }

    //------------------
    // Mapping stuff
    //------------------

    addValueMappingMap() {
        this.panel.valueMappings.push(new ValueColorMapping());
    }

    removeValueMappingMap(index) {
        this.panel.valueMappings.splice(index, 1);
        this.render();
    }

    replaceTokens(originalValue) {
        let value = originalValue;

        if (!value) {
            return value;
        }
        value += '';
        value = value.split(' ').map((a) => {
            if (a.startsWith('_fa-') && a.endsWith('_')) {
                const icon = a.replace(/_/g, '').split(',')[0];
                const color = a.indexOf(',') > -1 ? ` style="color:${normalizeColor(a.replace(/_/g, '').split(',')[1])}" ` : '';
                const repeatCount = a.split(',').length > 2 ? +(a.replace(/_/g, '').split(',')[2]) : 1;
                a = `<i class="fa ${icon}" ${color}></i> `.repeat(repeatCount);
            } else if (a.startsWith('_img-') && a.endsWith('_')) {
                a = a.slice(0, -1);
                const imgUrl = a.replace('_img-', '').split(',')[0];
                const imgWidth = a.split(',').length > 1 ? a.replace('_img-', '').split(',')[1] : '20px';
                const imgHeight = a.split(',').length > 2 ? a.replace('_img-', '').split(',')[2] : '20px';
                const repeatCount = a.split(',').length > 3 ? +(a.replace('_img-', '').split(',')[3]) : 1;
                a = `<img width="${imgWidth}" height="${imgHeight}" src="${imgUrl}"/>`.repeat(repeatCount);
            }
            return a;
        }).join(' ');

        return this.$sce.trustAsHtml(value);
    }

    getMappingOperators() {
        return getMappingOperators();
    }

    setUnitFormat(sensor, subItem) {
        sensor.unitFormat = subItem.value;
        this.render();
    }

    setBackgroundImage() {
        this.panel.realbgimage = this.templateSrv.replace(this.panel.bgimage);
        this.render();
    }
}

function isEqualTo(a, b) {
    // Could be ok if Im comparing strings and numbers
    // eslint-disable-next-line eqeqeq
    return (a !== undefined && b !== undefined) ? a == b : false;
}

function isGreaterThan(a, b) {
    return (a !== undefined && b !== undefined) ? a > b : false;
}

function isLessThan(a, b) {
    return (a !== undefined && b !== undefined) ? a < b : false;
}

function getMappingOperators() {
    return mappingOperators;
}

function getRandomId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

function ValueColorMapping() {
    // TODO: check if it doesnt exist yet
    this.id = getRandomId();
    this.name = undefined;
    this.operatorName = mappingOperators[0].name;
    this.compareTo = undefined;
    this.isSensorFontBold = false;
    this.fontColor = '#000';
    this.bgColor = '#fff';
    this.nameBlink = false;
    this.valueBlink = false;
    this.bgBlink = false;
}

function Sensor() {
    this.metric = '';
    this.xlocation = 50;
    this.ylocation = 25;
    this.bgColor = 'rgba(64,64,64,1.000)';
    this.fontColor = 'rgba(255,255,255,1.000)';
    this.size = 14;
    this.visible = true;
    this.renderValue = true;
    this.valueFormatted = '';
    this.valueUnit = '';
    this.displayName = '';
    this.link_url = '';
    this.resolvedLink = '';
    this.rectangular = true;
    this.valueMappingIds = [];
    this.isBold = false;
    this.id = getRandomId();
    this.unitFormat = 'none';
    this.decimals = 2;
    this.sizeCoefficient = undefined;
}

function normalizeColor(color) {
    if (color.toLowerCase() === 'green') {
        return 'rgba(50, 172, 45, 0.97)';
    }
    if (color.toLowerCase() === 'orange') {
        return 'rgba(237, 129, 40, 0.89)';
    }
    if (color.toLowerCase() === 'red') {
        return 'rgba(245, 54, 54, 0.9)';
    }
    return color.toLowerCase();
}

ImageItCtrl.templateUrl = 'module.html';
