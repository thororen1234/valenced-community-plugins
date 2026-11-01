import { getAssetIdByName } from '@valenced/assets'
import Page from '@valenced/components/Page'
import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useState } from 'react'
import { Image, ScrollView } from 'react-native'
import { setRules } from '.'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Rule, Settings } from '.'

const {
	AlertActionButton,
	AlertModal,
	Button,
	Stack,
	TableRow,
	TableRowGroup,
	TableSwitchRow,
	Text,
	TextInput,
} = Design

const ChevronSmallRightIcon = getAssetIdByName('ChevronSmallRightIcon')!

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const [rules, setLocalRules] = useState<Rule[]>(
		() => storage.cache?.rules ?? [],
	)

	const [open, setOpen] = useState<number | null>(null)

	const save = (next: Rule[]) => {
		setLocalRules(next)
		setRules(next)
	}

	const update = (index: number, patch: Partial<Rule>) =>
		save(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))

	return (
		<ScrollView keyboardShouldPersistTaps="handled">
			<Page>
				{rules.length === 0 && (
					<Text variant="text-md/medium" color="text-muted">
						No rules created yet.
					</Text>
				)}
				{rules.map((rule, i) => (
					<RuleEditor
						key={i}
						rule={rule}
						open={open === i}
						onToggle={() => setOpen(open === i ? null : i)}
						onChange={patch => update(i, patch)}
						onDelete={() => {
							setOpen(null)
							save(rules.filter((_, j) => j !== i))
						}}
					/>
				))}
				<Button
					text="New Rule"
					variant="primary"
					size="md"
					icon={getAssetIdByName('PlusSmallIcon')}
					onPress={() => {
						setOpen(rules.length)
						save([
							...rules,
							{
								name: 'New Rule',
								match: '',
								flags: 'gi',
								replace: '',
								regex: false,
							},
						])
					}}
				/>
			</Page>
		</ScrollView>
	)
}

function RuleEditor({
	rule,
	open,
	onToggle,
	onChange,
	onDelete,
}: {
	rule: Rule
	open: boolean
	onToggle: () => void
	onChange: (patch: Partial<Rule>) => void
	onDelete: () => void
}) {
	const name = rule.name || 'Unnamed Rule'

	return (
		<Stack spacing={12}>
			<TableRowGroup>
				<TableRow
					label={name}
					subLabel={rule.match ? `Matches: ${rule.match}` : 'No match set'}
					trailing={
						<Image
							source={ChevronSmallRightIcon}
							style={{
								width: 20,
								height: 20,
								tintColor: Tokens.default.colors.TEXT_MUTED,
								transform: [{ rotate: open ? '270deg' : '90deg' }],
							}}
						/>
					}
					onPress={onToggle}
				/>
			</TableRowGroup>
			{open && (
				<RuleFields
					rule={rule}
					name={name}
					onChange={onChange}
					onDelete={onDelete}
				/>
			)}
		</Stack>
	)
}

function RuleFields({
	rule,
	name,
	onChange,
	onDelete,
}: {
	rule: Rule
	name: string
	onChange: (patch: Partial<Rule>) => void
	onDelete: () => void
}) {
	return (
		<Stack spacing={12}>
			<TextInput
				label="Name"
				placeholder="Rule Name"
				value={rule.name}
				onChange={v => onChange({ name: v })}
			/>
			<TextInput
				label="Match"
				placeholder="Text to replace"
				value={rule.match}
				onChange={v => onChange({ match: v })}
			/>
			<TextInput
				label="Replace with"
				placeholder="New text"
				value={rule.replace}
				onChange={v => onChange({ replace: v })}
			/>
			{rule.regex && (
				<TextInput
					label="Regex Flags"
					placeholder="gi"
					value={rule.flags}
					onChange={v => onChange({ flags: v })}
				/>
			)}
			<TableRowGroup>
				<TableSwitchRow
					label="Regex Mode"
					subLabel="Treat the match string as a regular expression"
					value={rule.regex}
					onValueChange={v => onChange({ regex: v })}
				/>
				<TableRow
					label="Copy Rule JSON"
					icon={<TableRow.Icon source={getAssetIdByName('CopyIcon')} />}
					onPress={() => {
						Clipboard.setString(
							`\`\`\`json\n${JSON.stringify(rule, null, 4)}\n\`\`\``,
						)
						ToastActionCreators.open('TEXT_REPLACE_COPIED', {
							text: `Copied ${name} to clipboard`,
							icon: lookupGeneratedIconComponent('CopyIcon'),
						})
					}}
				/>
				<TableRow
					label="Delete Rule"
					variant="danger"
					icon={
						<TableRow.Icon
							source={getAssetIdByName('TrashIcon')}
							variant="danger"
						/>
					}
					onPress={() => confirmDelete(name, onDelete)}
				/>
			</TableRowGroup>
		</Stack>
	)
}

function confirmDelete(name: string, onDelete: () => void) {
	AlertActionCreators.openAlert(
		'fiery.text-replace.delete-rule',
		<AlertModal
			title="Delete Rule?"
			content={`Are you sure you want to delete ${name}? This cannot be undone.`}
			actions={
				<>
					<AlertActionButton
						variant="destructive"
						text="Delete"
						onPress={onDelete}
					/>
					<AlertActionButton variant="secondary" text="Cancel" />
				</>
			}
		/>,
	)
}
