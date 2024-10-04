const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

import {onCreateEffect, onEditEffect, onDeleteEffect, onToggleEffect, prepareActiveEffectCategories} from '../../active-effects/effects'
import {DL} from '../../config'
import tippy from "tippy.js";
import {buildDropdownListHover} from "../../utils/handlebars-helpers";
import 'tippy.js/animations/shift-away.css';
import { DemonlordItem } from "../item";
import { capitalize, enrichHTMLUnrolled, i18n} from "../../utils/utils";
import { 
  getNestedItemData,
  getNestedDocument,
  createActorNestedItems,
  deleteActorNestedItems, 
  PathLevel,
  PathLevelItem,
  DamageType
} from '../nested-objects';

export default class DLBaseItemSheetV2 extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    tag: 'form',
    form: {
      handler: this.onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    classes: ['demonlord-v2-sheet', 'demonlord-v2-item'],
    actions: {
      toggleAmmoRequired: this.onToggleArmorRequired,
      toggleAutoDestroy: this.onToggleAutoDestroy,
      toggleShield: this.onToggleShield,
      createEffect: this.onManageEffect,
      editEffect: this.onManageEffect,
      toggleEffect: this.onManageEffect,
      deleteEffect: this.onManageEffect,
      createDamage: this.onEditDamage,
      deleteDamage: this.onEditDamage,
      toggleInfo: this.onToggleInfo,
      createNestedItem: this.onCreateNestedItem,
      editNestedItem: this.onEditNestedItem,
      deleteItem: this.onDeleteItem,
      toggleSpeak: this.onToggleSpeak,
      toggleRead: this.onToggleRead,
      toggleWrite: this.onToggleWrite,
      toggleHealing: this.onToggleHealing,
      toggleAttackBonus: this.onToggleAttackBonus,
      toggleChallengeBonus: this.onToggleChallengeBonus,
      editImage: this.onEditImage,
      selectLevel: this.onSelectLevel,
      addLevel: this.onAddLevel,
      transferItem: this.onTransferItem
    },
    window: {
      resizable: true
    },
    position: {
      width: 600,
      height: 650,
    },
    scrollY: ['.tab.paths', '.tab.active'],
    editable: true
  }

  static PARTS = {
    header: { template: 'systems/demonlord/templates/v2/item/parts/item-sheet-header.hbs' },
    tabs: { template: 'systems/demonlord/templates/v2/generic/tab-navigation.hbs' },
    description: { template: 'systems/demonlord/templates/v2/item/parts/item-description.hbs' },
    effects: { template: 'systems/demonlord/templates/v2/item/parts/item-effects.hbs' },

    // Attributes
    ancestry: { template: 'systems/demonlord/templates/v2/item/item-ancestry-sheet.hbs' },
    ammo: { template: 'systems/demonlord/templates/v2/item/item-ammo-sheet.hbs' },
    armor: { template: 'systems/demonlord/templates/v2/item/item-armor-sheet.hbs' },
    creaturerole: { template: 'systems/demonlord/templates/v2/item/item-role-sheet.hbs'},
    endoftheround: { template: 'systems/demonlord/templates/v2/item/item-endoftheround-sheet.hbs' },
    feature: { template: 'systems/demonlord/templates/v2/item/item-feature-sheet.hbs' }, // Empty
    item: { template: 'systems/demonlord/templates/v2/item/item-item-sheet.hbs' },
    language: { template: 'systems/demonlord/templates/v2/item/item-language-sheet.hbs' },
    path: { template: 'systems/demonlord/templates/v2/item/item-path-sheet.hbs' },
    profession: { template: 'systems/demonlord/templates/v2/item/item-profession-sheet.hbs' }, // Empty
    relic: { template: 'systems/demonlord/templates/v2/item/item-relic-sheet.hbs' },
    specialaction: { template: 'systems/demonlord/templates/v2/item/item-specialaction-sheet.hbs' }, // Empty
    spell: { template: 'systems/demonlord/templates/v2/item/item-spell-sheet.hbs' },
    talent: { template: 'systems/demonlord/templates/v2/item/item-talent-sheet.hbs' },
    weapon: { template: 'systems/demonlord/templates/v2/item/item-weapon-sheet.hbs' }
  }

  // Default tab
  static PARTS_MAP = {
    'ancestry': 'ancestry',
    'ammo': 'ammo',
    'armor': 'armor',
    'creaturerole': 'role',
    'endoftheround': 'endoftheround',
    'feature': 'description',
    'item': 'item',
    'language': 'language',
    'path': 'path',
    'profession': 'description',
    'relic': 'relic',
    'specialaction': 'description',
    'spell': 'spell',
    'talent': 'talent',
    'weapon': 'weapon'
  }

  get isEditable() {
    let editable = this.options.editable && (this.document.isOwner || this.document.isGM)

    // Only some types can be toggled edit
    if (!['ancestry', 'creaturerole', 'path'].includes(this.document.type)) {
      editable = false
    }

    if (this.document.pack) {
      const pack = game.packs.get(this.document.pack)
      if (pack.locked) editable = false
    }

    return editable
  }

  /**
   * @override
   */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);

    // These parts are always rendered
    options.parts = [ 'header' ]

    // Optionally add the main tab (attributes)
    const map = {
      'creaturerole': 'role'
    }

    const ignoredParts = [ 'feature', 'profession', 'specialaction' ] // Ideally temporary

    if (!ignoredParts.includes(this.item.type)) {
      options.parts.push(map[this.item.type] || this.item.type)
    }

    // Add the rest of the tabs
    options.parts.push('description', 'effects')

    // Finally, adjust the window position according to the type
    this._adjustSizeByItemType(this.item.type, this.position)
  }

  /** @override */
  static  (options = {}) {
    const position = super.setPosition(options)
    const sheetBody = this.element.find('.sheet-body')
    const bodyHeight = position.height - 125
    sheetBody.css('height', bodyHeight)
    return position
  }

  _adjustSizeByItemType(type, position) {
    switch (type) {
      case 'ancestry':
        position.width = 700
        position.height = 700
        break
      case 'path':
        position.width = 700
        position.height = 700
        break
      default: break
    }
  }

  /* -------------------------------------------- */
  /*  Data                                        */

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    context.isGM = game.user.isGM
    context.isOwner = this.actor?.isOwner,
    context.lockAncestry = game.settings.get('demonlord', 'lockAncestry')
    context.config = DL
    context.item = this.item
    context.system = this.document.system

    if (options.isFirstRender) {
      this.tabGroups['primary'] = this.tabGroups['primary'] ?? options.parts.find(p => Object.values(DLBaseItemSheetV2.PARTS_MAP).includes(p))
    }

    // Retrieve data for nested items
    if (['ancestry', 'creaturerole', 'path'].includes(this.item.type)) {
      for await (let i of context.item.system.levels.keys()) {
        context.item.system.levels[i].talents = await Promise.all(context.item.system.levels[i].talents.map(await getNestedItemData))
        context.item.system.levels[i].talentspick = await Promise.all(context.item.system.levels[i].talentspick.map(await getNestedItemData))
        context.item.system.levels[i].spells = await Promise.all(context.item.system.levels[i].spells.map(await getNestedItemData))
      }
    }

    context.tabs = this._getTabs(options.parts)

    // Enrich the description
    context.system.enrichedDescription = await TextEditor.enrichHTML(this.document.system.description);
    context.system.enrichedDescriptionUnrolled = await enrichHTMLUnrolled(this.document.system.description)

    context.effects = prepareActiveEffectCategories(this.document.effects, true, true)

    if (context.item.type === 'weapon' || context.item.type === 'spell' || context.item.type === 'talent' || context.item.type === 'endoftheround') this._prepareDamageTypes(context)

    this.sectionStates = this.sectionStates || new Map()

    if (context?.system?.contents != undefined && context.system.contents.length > 0) {
      context.system.contents = await Promise.all(context.system.contents.map(getNestedItemData))
    }

    return context
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options)

    switch (partId) {
      case 'header':
        context.isEditable = this.isEditable
        context.edit = this.item.system[`edit${capitalize(context.item.type)}`]
        context.editId = `system.edit${capitalize(context.item.type)}`
        break
      case 'feature':
      case 'specialaction':
      case 'profession':
        break
      case 'ammo':
      case 'armor':
      case 'endoftheround':
      case 'item':
      case 'language':
      case 'relic':
      case 'spell':
      case 'talent':
      case 'weapon':
      case 'description':
      case 'effects':
        context.tab = context.tabs[partId]
        context.cssClass = context.tab.cssClass
        context.active = context.tab.active
        break
      case 'ancestry':
      case 'path':
        context.tab = context.tabs[partId]
        context.cssClass = context.tab.cssClass
        context.active = context.tab.active
        context.system.selectedLevelIndex = this._selectedLevelIndex || 0
        break
    }

    return context
  }

  /* -------------------------------------------- */

  /**
   * Handles the damage types updates
   * @override */
  static async onSubmit(event, form, formData) {
    const item = this.item
    const updateData = foundry.utils.expandObject(formData.object)

    if (['talent', 'weapon', 'spell', 'endoftheround'].includes(item.type)) {
      // Set the update key based on type
      const damageKey = 'system.action.damagetypes'
      // Grab damages from form
      let altdamage = updateData.altdamage
      let altdamagetype = updateData.altdamagetype
      altdamage = Array.isArray(altdamage) ? altdamage : [altdamage]
      altdamagetype = Array.isArray(altdamagetype) ? altdamagetype : [altdamagetype]

      // Zip the damage-damagetypes into objects, filtering them for types that do not have a damage
      updateData[damageKey] = altdamage
        .map((damage, index) => ({
          damage: damage,
          damagetype: altdamagetype[index],
        }))
        .filter(d => Boolean(d.damage))
      // Remove the unzipped values from the update data
      delete updateData.altdamage
      delete updateData.altdamagetype
    }

    // If a Talent has no uses it's always active
    if (item.type === 'talent') updateData.system.addtonextroll = !updateData.system?.uses?.max

    // Path
    if (item.type === 'path') {
      const system = {}
      formData = formData.object
      const completeFormData = this._getPathDataFromForm()

      system.editPath = formData['system.editPath'] ?? item.system.editPath
      system.description = formData['system.description'] || item.system.description
      system.type = formData['system.type']

      if (!system.type) delete system.type

      if (completeFormData.length > 0) {
        if (item.system.editPath) {
          system.levels = this._getEditLevelsUpdateData(completeFormData)
          system.levels.sort(this._sortLevels)
  
          // Set default image based on new path type
          const hasADefaultImage = Object.values(CONFIG.DL.defaultItemIcons.path).includes(formData.img)
          if (game.settings.get('demonlord', 'replaceIcons') && hasADefaultImage) {
            updateData.img = CONFIG.DL.defaultItemIcons.path[formData['system.type']] || CONFIG.DL.defaultItemIcons.path.novice
          }
        } else {
          system.levels = this._getViewLevelsUpdateData(completeFormData)
        }
      }
      
      // Change the levels based on the path type
      if (system.type && item.system.editPath && system.type !== item.system.type) {
        let autoLevels = []
        switch (system.type) {
          case 'novice':
            autoLevels = [1, 2, 5, 8];
            break
          case 'expert':
            autoLevels = [3, 6, 9];
            break
          case 'master':
            autoLevels = [7, 10];
            break
          case 'legendary':
            autoLevels = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
        }
        system.levels = system.levels ?? []
        for (let index of autoLevels.keys()) {
          if (!system.levels[index]) system.levels[index] = new PathLevel({level: autoLevels[index]})
          else system.levels[index].level = autoLevels[index]
        }
      }

      updateData.system = system
      if (updateData.level) delete updateData.level
    }

    await item.update(updateData)
    this.render()
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */
  static async onToggleArmorRequired() {
    await this.document.update({
      'system.consume.ammorequired': !this.document.system.consume.ammorequired,
      'system.consume.ammoitemid' : ''
   })
  }

  static async onToggleAutoDestroy() {
    await this.document.update({'system.autoDestroy': !this.document.system.autoDestroy})
  }

  static async onToggleShield() {
    await this.document.update({'system.isShield': !this.document.system.isShield})
  }

  static async onManageEffect(event) {
    const a = event.target.closest('a')
    const li = event.target.closest('li')

    switch (a.dataset.action) {
      case 'createEffect': return onCreateEffect(li, this.document)
      case 'editEffect': return onEditEffect(li, this.document)
      case 'deleteEffect': return onDeleteEffect(li, this.document)
      case 'toggleEffect': return onToggleEffect(li, this.document)
    }    
  }

  static async onEditDamage(event) {
    event.preventDefault()
    const a = event.target.closest('a')
    const damageTypes = this.document.system.action.damagetypes
    const updKey = `system.action.damagetypes`

    if (a.dataset.action === 'createDamage') damageTypes.push(new DamageType())
    else if (a.dataset.action === 'deleteDamage') damageTypes.splice(a.dataset.id, 1)
    await this.document.update({[updKey]: damageTypes}, {parent: this.actor}).then(_ => this.render())
  }

  static async onToggleInfo(event) {
    const elem = $(event.target)
    const root = elem.closest('[data-item-id]')
    const selector = '.fa-chevron-down, .fa-chevron-up'
    const chevron = elem.is(selector) ? elem : elem.find(selector);
    const elements = $(root).find('.dlInfo')
    elements.each((_, el) => {
      if (el.style.display === 'none') {
        $(el).slideDown(100)
        chevron?.removeClass('fa-chevron-up')
        chevron?.addClass('fa-chevron-down')
      } else {
        $(el).slideUp(100)
        chevron?.removeClass('fa-chevron-down')
        chevron?.addClass('fa-chevron-up')
      }
    })
  }
  
  static async onCreateNestedItem(event) {
    const type = event.target.closest('[data-type]').dataset.type

    // Create a folder for the quick item to be stored in
    const folderLoc = event.target.closest('[data-folder-loc]').dataset.folderLoc
    const folderName = i18n("DL." + folderLoc)
    let folder = game.folders.find(f => f.name === folderName)
    if (!folder) {
      folder = await Folder.create({name:folderName, type: DemonlordItem.documentName})
    }

    const item = {
      name: `New ${type.capitalize()}`,
      type: type,
      folder: folder.id,
      system: {},
    }

    const newItem = await this.createNestedItem(item, folderName)
    newItem.sheet.render(true)
    this.render()
    return newItem
  }

  static async onEditNestedItem(event) {
    const data = await this.document

    const group = event.target.closest('[data-group]')?.dataset?.group
    const level = event.target.closest('[data-level]')?.dataset?.level
    const itemId = event.target.closest('[data-item-id]')?.dataset?.itemId
    let nestedData

    if (level) {
      // Path or ancestry item
      nestedData = data.system.levels[level][group].find(i => i._id === itemId)
    } else {
      // No contents, what did we even click
      if (!data.system.contents) return

      nestedData = data.system.contents.find(i => i._id === itemId)
    }

    await getNestedDocument(nestedData).then(d => {
      if (d.sheet) d.sheet.render(true)
      else ui.notifications.warn('The item is not present in the game and cannot be edited.')
    })

  }

  static async onDeleteItem(event) {
    const itemLevel = event.target.closest('[data-level]')?.dataset?.level
    const levelIndex = event.target.closest('[data-level-index]')?.dataset?.levelIndex
    const itemGroup = event.target.closest('[data-group]')?.dataset?.group
    const itemIndex = event.target.closest('[data-item-index]')?.dataset?.itemIndex

    if (itemLevel ?? levelIndex) {
      // Part of path or ancestry
      const itemData = foundry.utils.duplicate(this.item)
  
      if (itemGroup === 'talents') itemData.system.levels[itemLevel].talents.splice(itemIndex, 1)
      else if (itemGroup === 'talentspick') itemData.system.levels[itemLevel].talentspick.splice(itemIndex, 1)
      else if (itemGroup === 'spells') itemData.system.levels[itemLevel].spells.splice(itemIndex, 1)
      else if (itemGroup === 'primary') itemData.system.levels.splice(levelIndex, 1) // Deleting a level
      await this.item.update(itemData)
    } else { 
      // Item contents
      await this.deleteContentsItem(itemIndex)
    }
  }

  static async onToggleSpeak () {
    await this.document.update({'system.speak': !this.document.system.speak})
  }

  static async onToggleRead () {
    await this.document.update({'system.read': !this.document.system.read})
  }

  static async onToggleWrite () {
    await this.document.update({'system.write': !this.document.system.write})
  }

  static async onToggleHealing () {
    await this.document.update({'system.healing.healing': !this.document.system.healing.healing})
  }

  static async onToggleAttackBonus (event) {
    const attribute = event.target.closest('div').dataset.attribute
    const property = `system.action.${attribute}boonsbanesselect`
    await this.document.update({[property]: !foundry.utils.getProperty(this.document, property) })
  }

  static async onToggleChallengeBonus (event) {
    const attribute = event.target.closest('div').dataset.attribute
    const property = `system.challenge.${attribute}boonsbanesselect`
    await this.document.update({[property]: !foundry.utils.getProperty(this.document, property) })
  }

  /**
   * Handle changing a Document's image.
   * @param {MouseEvent} event  The click event.
   * @returns {Promise}
   * @protected
   * Credit to Ethanks from the League of Extraordinary FoundryVTT Developers
   */
  static async onEditImage(event, target) {
    const attr = target.dataset.edit
    const documentData = this.document.toObject()
    const current = foundry.utils.getProperty(documentData, attr)
    const { img } = this.document.constructor.getDefaultArtwork?.(documentData) ?? {}
    const fp = new FilePicker({
        current,
        type: "image",
        redirectToRoot: img ? [img] : [],
        callback: (path) => {
            this.document.update({ [attr]: path })
        },
        top: this.position.top + 40,
        left: this.position.left + 10,
    });
    return fp.browse()
  }

  static async onSelectLevel(event, target) {
    // Display/hide levels on click
    const levelIndex = $(target).closest('[data-level-index]').data('levelIndex')
    const form = $(target).closest("form")
    this._selectedLevelIndex = levelIndex
    form.find('.dl-path-level').each((_, pl) => {
      pl = $(pl)
      if (pl.data('levelIndex') === levelIndex) pl.show()
      else pl.hide()
    })
  }

  static async onAddLevel() {
    await this.item.update({
      'system.levels': [...(this.item.system.levels || []), new PathLevel()],
    })
  }

  static async onTransferItem(event) {
    // Grab data from the event
    const itemIndex = event.target.closest('[data-item-index]').dataset.itemIndex
    const itemGroup = event.target.closest('[data-group]').dataset.group
    const itemId = event.target.closest('[data-item-id]').dataset.itemId
    const itemLevelIndex = event.target.closest('[data-level]').dataset.level

    // Grab the nested item data
    const itemData = this.item.toObject()
    const nestedItemData = itemData.system.levels[itemLevelIndex][itemGroup][itemIndex]
    let selected = nestedItemData.selected = !nestedItemData.selected
    await this.document.update({ system: itemData.system })

    // If the item is inside a character, and the actor level matches the item level, add it to the actor
    const actor = this.document.parent
    if (!actor || actor.type !== 'character') return
    const levelRequired = itemData.system.levels[itemLevelIndex].level
    if (parseInt(actor.system.level) >= levelRequired && selected)
      await createActorNestedItems(actor, [nestedItemData], this.document.id, levelRequired)
    else
      await deleteActorNestedItems(actor, null,  itemId)
  }

  /* -------------------------------------------- */
  /*  Listeners                                   */
  /* -------------------------------------------- */

  /** @override */
  async _onRender (context, options) { // eslint-disable-line no-unused-vars
    let e = this.element
    // Tooltips
    tippy(e.querySelectorAll('[data-tippy-content]'))
    tippy(e.querySelectorAll('[data-tippy-html]'), {
      content(reference) {
        return $(reference).data('tippyHtml')
      },
      allowHTML: true
    })

    // Dropdowns
    tippy(e.querySelectorAll('.dropdown-group'), {
      content(reference) {
        return buildDropdownListHover(reference.attributes.name.value, reference.attributes.value.value, context.item)
      },
      allowHTML: true,
      interactive: true,
      trigger: 'click',
      placement: 'bottom',
      arrow: false,
      offset: [0, 0],
      theme: 'demonlord-dropdown',
      animation: 'shift-away',
    })


    // Add drag events.
    e.querySelectorAll('.drop-area, .drop-zone, .drop-zone *').forEach(el => {

      el.addEventListener('dragover', this._onDragOver.bind(this))
      el.addEventListener('dragleave', this._onDragLeave.bind(this))
      el.addEventListener('drop', this._onDrop.bind(this))
    })

    // Create nested items by dropping onto item
    this.element.addEventListener('drop', ev => this._onDropItem(ev))

    // Max castings
    e.querySelector('.max-castings-control')?.addEventListener('change', async ev => await this._onManageMaxCastings(ev, this))
    e.querySelector('.item-group-spell-castings')?.addEventListener('contextmenu', async ev => await this._onToggleMaxCastingsCalculation(ev, this))

    // Contents item quantity and delete functions
    e.querySelectorAll('.item-uses')?.forEach(el => el.addEventListener('mousedown', async ev => await this._onUpdateContentsItemQuantity(ev)))

    if (this.document.parent?.isOwner) {
      const dragHandler = async ev => await this._onDrag(ev)
      e.querySelectorAll('.nested-item').forEach(el => {
        el.setAttribute('draggable', true)
        el.addEventListener('dragstart', dragHandler, false)
        el.addEventListener('dragend', dragHandler, false)
      })
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async activateListeners(html) {
    super.activateListeners(html)

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return

    if (this.isEditable) {
      const inputs = html.find('input')
      inputs.focus(ev => ev.currentTarget.select())
    }
  }

  /* -------------------------------------------- */
  /*  Auxiliary functions                         */

  /* -------------------------------------------- */

  _getTabs(parts) {
    const tabGroup = 'primary'

    const tabs = {}

    for (const partId of parts) {
      const tab = {
        id: '',
        group: tabGroup,
        label: 'DL.Tabs',
      }

      if (DLBaseItemSheetV2.PARTS_MAP[partId]) {
        tab.id = partId
        tab.label += 'Attributes'
      } else if (['description', 'effects'].includes(partId)) {
        tab.id = partId,
        tab.label += capitalize(partId)
      } else {
        continue
      }

      tab.active = this.tabGroups[tab.group] === tab.id
      tab.cssClass = tab.active ? 'active': ''

      tabs[partId] = tab
    }

    return tabs
  }

  _prepareDamageTypes(sheetData) {
    sheetData.item.damagetypes = this.item.system.action?.damagetypes
  }

  async _onManageDamageType(ev, options = {}) {
    ev.preventDefault()
    const a = ev.currentTarget
    const damageTypes = this.document.system.action.damagetypes
    const updKey = `system.action.damagetypes`

    if (a.dataset.action === 'create') damageTypes.push(new DamageType())
    else if (a.dataset.action === 'delete') damageTypes.splice(a.dataset.id, 1)
    await this.document.update({[updKey]: damageTypes}, {...options, parent: this.actor}).then(_ => this.render())
  }

  async _onManageMaxCastings (ev, sheet) {
    // Set the flag if textbox has been modified. Clear if blank.
    const target = ev.currentTarget
    const spell = sheet.document
    await spell.update({
      system: {
        castings: {
          max: target.value
        }
      }
    })
  }
  
  async _onToggleMaxCastingsCalculation (ev, sheet) {
    // Set the flag if textbox has been modified. Clear if blank.
    const spell = sheet.document
    await spell.update({
      system: {
        castings: {
          ignoreCalculation: !spell.system.castings.ignoreCalculation
        }
      }
    })
  }

  _getPathDataFromForm() {
    // Get all html elements that are 'path-level' and group their inputs by path-level
    const htmlLevels = []
    $(this.element)
      .find('.dl-path-level')
      .each((i, pl) => {
        htmlLevels.push($(pl).find("*[name^='level']"))
      })

    // From the htmlLevels, construct the levels array based on the input names and values
    const objLevels = []
    for (const hl of htmlLevels) {
      const obj = {}
      hl.each((i, input) => {
        const _name = input.getAttribute('name')
        if (input.tagName === 'SELECT') {
          obj[_name] = input.options[input?.selectedIndex]?.getAttribute('value')
        } else if (input.tagName === 'LABEL') {
          // Check first child for checkbox or radio
          if (input.children[0].type === 'checkbox') {
            obj[_name] = input.children[0].checked || false
          } else if (input.children[0].type === 'radio') {
            if (_name.startsWith('level.attributeSelectTwoSet')) {
              obj[_name] = input.children[0].checked
            } else {
              obj[_name] = input.children[0].value === 'true'
            }
          }
        } else if (input.type === 'checkbox') {
          obj[_name] = input.checked || false
        } else if (input.type === 'radio') {
          if (input.checked) {
            if (_name === 'level.attributeSelect') {
              obj[_name] = input.getAttribute('value')
            } else {
              obj[_name] = input.value === 'true'
            }
          }
          if (_name.startsWith('level.attributeSelectTwoSetSelectedValue') && input.checked) {
            obj[_name] = (input.getAttribute('value') ?? input.value) === 'true'
          }
        } else {
          obj[_name] = input.value ?? input.getAttribute('value')
        }
      })

      // Set value of level.attributeSelectTwoSetSelectedValue1 and 2 based on the selected sets
      if (obj['level.attributeSelect'] === "twosets") {
        obj['level.attributeSelectTwoSetSelectedValue1'] = obj['level.attributeSelectTwoSet2Selected'] || false
        obj['level.attributeSelectTwoSetSelectedValue2'] = obj['level.attributeSelectTwoSet4Selected'] || false
        
        delete obj['level.attributeSelectTwoSet1Selected']
        delete obj['level.attributeSelectTwoSet2Selected']
        delete obj['level.attributeSelectTwoSet3Selected']
        delete obj['level.attributeSelectTwoSet4Selected']
      }

      objLevels.push(foundry.utils.expandObject(obj).level)
    }
    return objLevels
  }

  _mergeLevels(currentLevels, formLevels) {
    const warn = () => ui.notifications.warn('More attributes selected than allowed') // FIXME: localize

    let index = 0
    formLevels.sort(this._sortLevels)
    currentLevels.sort(this._sortLevels).forEach(currentLevel => {
      // Check if attribute select is none or fixed, if so skip the merging
      if (['', 'fixed'].includes(currentLevel)) {
        index++
        return
      }

      // Convert new level to map
      const newLevel = new Map(Object.entries(formLevels[index++]))

      // Get number of choices
      let newChoices = 0
      newLevel.forEach((v, k) => {
        if (k.includes('attribute') && v === true) newChoices++
      })

      if (currentLevel.attributeSelectIsTwoSet) {
        currentLevel.attributeSelectTwoSetSelectedValue1 = newLevel.get('attributeSelectTwoSetSelectedValue1')
        currentLevel.attributeSelectTwoSetSelectedValue2 = newLevel.get('attributeSelectTwoSetSelectedValue2')
      } else if (currentLevel.attributeSelectIsChooseTwo) {
        if (newChoices > 2) return warn()
        newLevel.forEach((v, k) => (currentLevel[k] = v))
      } else if (currentLevel.attributeSelectIsChooseThree) {
        if (newChoices > 3) return warn()
        newLevel.forEach((v, k) => (currentLevel[k] = v))
      }
    })

    return currentLevels
  }


  _getViewLevelsUpdateData(completeFormData) {
    return this._mergeLevels(this.document.system.levels, completeFormData)
  }

  _getEditLevelsUpdateData(completeFormData) {
    const newLevels = completeFormData.map(cf => new PathLevel(cf))

    // Check duplicate levels in new data
    const hasDuplicates = new Set(newLevels.map(l => l.level)).size !== newLevels.length
    if (hasDuplicates) {
      ui.notifications.warn('Path items must not have duplicate levels')
      return this.document.system.levels
    }

    // Match the new levels with the old ones and keep the nested items
    const oldLevels = this.item.toObject().system.levels
    const notFound = [] // stores path levels that do not have been found in the current levels
    newLevels.forEach(newLevel => {
      const foundIndex = oldLevels.findIndex(l => +l.level === +newLevel.level)
      if (foundIndex >= 0) {
        // if index is found, remove the relative level from the list of old levels and keep the nested items
        const foundLevel = oldLevels.splice(foundIndex, 1)[0]
        this._keepNestedItems(newLevel, foundLevel)
        // Keep also the chosen user attributes
        if (newLevel.attributeSelectIsChooseTwo === foundLevel.attributeSelectIsChooseTwo || newLevel.attributeSelectIsChooseThree === foundLevel.attributeSelectIsChooseThree) {
          newLevel.attributeStrengthSelected = foundLevel.attributeStrengthSelected
          newLevel.attributeAgilitySelected = foundLevel.attributeAgilitySelected
          newLevel.attributeIntellectSelected = foundLevel.attributeIntellectSelected
          newLevel.attributeWillSelected = foundLevel.attributeWillSelected
        }
      } else notFound.push(newLevel)
    })
    // Assert that there is only one level not matching.
    // Not matching levels happen when a path level level changes so there should only be one
    if ((oldLevels.length > 1 && notFound.length > 1) || oldLevels.length !== notFound.length) {
      throw new Error('Error in path level matching')
    } else if (notFound.length === 1) {
      this._keepNestedItems(notFound[0], oldLevels[0])
    }
    return newLevels
  }

  _keepNestedItems(newLevelData, oldLevelData) {
    newLevelData.talentsSelected = oldLevelData?.talentsSelected || []
    newLevelData.talentspick = oldLevelData?.talentspick || []
    newLevelData.languages = oldLevelData?.languages || []
    newLevelData.talents = oldLevelData?.talents || []
    newLevelData.spells = oldLevelData?.spells || []
  }

  _sortLevels = (a, b) => (+a.level > +b.level ? 1 : -1)

  /* -------------------------------------------- */

  async _onDrag(ev){
    const itemIndex = ev.currentTarget.closest('[data-item-index]').dataset.itemIndex
    const data = await this.getData({})
    if (ev.type == 'dragend') {
      if (data.system.contents[itemIndex].system.quantity <= 1) {
        await this.deleteContentsItem(itemIndex)
      } else {
        await this.decreaseContentsItemQuantity(itemIndex)
      }
    } else if (ev.type == 'dragstart') {
      const dragData = { type: 'Item', 'uuid': data.system.contents[itemIndex].uuid }
      ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }
  }

  async _addItem(data, level, group) {
    const levelItem = new PathLevelItem()
    const pathData = foundry.utils.duplicate(this.item)
    const item = await getNestedItemData(data)
    if (!item || ['ancestry', 'path', 'creaturerole'].includes(item.type)) return

    levelItem.uuid = item.uuid ?? data.uuid
    levelItem.id = item.id || item._id
    levelItem._id = item.id || item._id
    levelItem.name = item.name
    levelItem.description = item.system.description
    levelItem.pack = data.pack ? data.pack : ''
    levelItem.data = item
    levelItem.img = item.img

    if (group === 'talents') pathData.system.levels[level]?.talents.push(levelItem)
    else if (group === 'talentspick') pathData.system.levels[level]?.talentspick.push(levelItem)
    else if (group === 'spells') pathData.system.levels[level]?.spells.push(levelItem)

    await this.item.update(pathData)
  }

  async _deleteItem(ev) {
    const itemLevel = $(ev.currentTarget).closest('[data-level]').data('level')
    const itemGroup = $(ev.currentTarget).closest('[data-group]').data('group')
    const itemIndex = $(ev.currentTarget).closest('[data-item-index]').data('itemIndex')
    const itemData = foundry.utils.duplicate(this.item)

    if (itemGroup === 'talents') itemData.system.levels[itemLevel].talents.splice(itemIndex, 1)
    else if (itemGroup === 'talentspick') itemData.system.levels[itemLevel].talentspick.splice(itemIndex, 1)
    else if (itemGroup === 'spells') itemData.system.levels[itemLevel].spells.splice(itemIndex, 1)
    await this.item.update(itemData)
  }

  _onDragOver(event) {
    $(event.target).addClass('drop-hover')
  }

  _onDragLeave(event) {
    $(event.target).removeClass('drop-hover')
  }

  async _onDrop(event) {
    $(event.target).removeClass('drop-hover')

    const group = event.target.closest('[data-group]').dataset.group
    const level = event.target.closest('[data-level]').dataset.level
    try {
      $(event.target).removeClass('drop-hover')
      const data = JSON.parse(event.dataTransfer.getData('text/plain'))
      if (data.type !== 'Item') return
      await this._addItem(data, level, group)
    } catch (err) {
      console.warn(err)
    }
  }

  async _onDropItem(ev) {
    if (this.item.system?.contents != undefined){
      try {
        const itemData = JSON.parse(ev.dataTransfer.getData('text/plain'))
        if (itemData.type === 'Item') {
          let actor
          const item = await fromUuid(itemData.uuid)
          
          let acceptedItemTypes = []

          // Filter drops depending on the item type
          switch (this.item.type) {
            case 'item': 
              acceptedItemTypes = ['ammo', 'armor', 'item', 'weapon']
              break
            case 'relic':
              acceptedItemTypes = ['talent']
              break
            default:
              acceptedItemTypes = []
              break
          }

          if (!item && !acceptedItemTypes.includes(item.type)) return

          const itemUpdate = {'_id': item._id}
          if (itemData.uuid.startsWith('Actor.')) {
            actor = item.parent
            /*Since item contents aren't actually embedded we don't want to end up with a reference
            to a non-existant item. If our item exists outside of the actor-embedded version, use that as our source.
            Otherwise, create it as a world-level item and update the original's core.sourceId flag accordingly.*/
            if (item.flags?.core?.sourceId != undefined) {
              game.items.getName(item.name) ? itemData.uuid = game.items.getName(item.name).uuid : itemData.uuid = item.flags.core.sourceId
            } else {
              const newItem = await this.createNestedItem(foundry.utils.duplicate(item), `${actor.name}'s Items (${this.item.name})`)
              itemUpdate['flags.core.sourceId'] = newItem.uuid;
              itemData.uuid = newItem.uuid
            }
          }
          if (itemUpdate?.flags?.core?.sourceId == undefined) itemUpdate['flags.core.sourceId'] = itemData.uuid

          //If the item we're adding is the same as the container, bail now
          if (this.item.sameItem(item)) {
            ui.notifications.warn("Can't put an item inside itself!")
            return
          }

          //If the item was in an Actor's inventory, update the quantity there
          if (actor != undefined) {
            if (item.system.quantity > 0) {
              itemUpdate['system.quantity'] = item.system.quantity-1;
              await actor.updateEmbeddedDocuments('Item', [itemUpdate])
            }
          }

          await this.addContentsItem(itemData)
        }
      } catch (e) {
        console.warn(e)
      }
    }
  }

  async _onNestedItemCreate(ev) {
    const type = $(ev.currentTarget).closest('[data-type]').data('type')

    // Create a folder for the quick item to be stored in
    const folderLoc = $(ev.currentTarget).closest('[data-folder-loc]').data('folderLoc')
    const folderName = i18n("DL." + folderLoc)
    let folder = game.folders.find(f => f.name === folderName)
    if (!folder) {
      folder = await Folder.create({name:folderName, type: DemonlordItem.documentName})
    }

    const item = {
      name: `New ${type.capitalize()}`,
      type: type,
      folder: folder.id,
      system: {},
    }

    const newItem = await this.createNestedItem(item, folderName)
    newItem.sheet.render(true)
    this.render()
    return newItem
  }

  // eslint-disable-next-line no-unused-vars
  // async _onNestedItemEdit(ev) {
  //   const data = await this.document
  //   if (!data.system.contents) {
  //     return
  //   }
  //   const itemId = $(ev.currentTarget).closest('[data-item-id]').data('itemId')
  //   const nestedData = data.system.contents.find(i => i._id === itemId)
  //   await getNestedDocument(nestedData).then(d => {
  //     if (d.sheet) d.sheet.render(true)
  //     else ui.notifications.warn('The item is not present in the game and cannot be edited.')
  //   })
  // }

  async _onUpdateContentsItemQuantity(ev) {
    const itemIndex = ev.currentTarget.closest('[data-item-index]').dataset.itemIndex

    if (ev.button == 0) {
      await this.increaseContentsItemQuantity(itemIndex)
    } else if (ev.button == 2) {
      await this.decreaseContentsItemQuantity(itemIndex)
    }
  }

  // async _onContentsItemDelete(ev) {
  //   const itemIndex = $(ev.currentTarget).closest('[data-item-index]').data('itemIndex')
  //   await this.deleteContentsItem(itemIndex)
  // }

  async createNestedItem(itemData, folderName) {
    let folder = game.folders.find(f => f.name === folderName)
    if (!folder) {
      folder = await Folder.create({name:folderName, type: DemonlordItem.documentName})
    }
    if (itemData?._id != undefined) delete itemData._id;
    itemData.folder = folder._id
    if (itemData?.system?.quantity != undefined) itemData.system.quantity = 1

    return await DemonlordItem.create(itemData)
  }

  async addContentsItem(data) {
    const item = await getNestedItemData(data)
    const containerData = foundry.utils.duplicate(this.item)
    containerData.system.contents.push(item)
    await this.item.update(containerData, {diff: false}).then(_ => this.render)
  }

  async increaseContentsItemQuantity(itemIndex) {
    const itemData = foundry.utils.duplicate(this.item)
    itemData.system.contents[itemIndex].system.quantity++
    await this.item.update(itemData, {diff: false}).then(_ => this.render)
  }

  async decreaseContentsItemQuantity(itemIndex) {
    const itemData = foundry.utils.duplicate(this.item)
    if (itemData.system.contents[itemIndex].system.quantity > 0) {
      itemData.system.contents[itemIndex].system.quantity--
      await this.item.update(itemData, {diff: false}).then(_ => this.render)
    } else {
      return
    }
  }

  async deleteContentsItem(itemIndex) {
    const itemData = foundry.utils.duplicate(this.item)

    itemData.system.contents.splice(itemIndex, 1)
    await this.item.update(itemData)
  }
}
